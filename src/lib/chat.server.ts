import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "./ai/run-id.server";
import { exploreNode, listStale, recordUpdate, searchGraph, traceDecision, whoOwnsOrKnows } from "./graph.server";

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const INSTRUCTIONS = `You are Cortex, the company brain for Northwind Labs. You answer questions using a knowledge graph that connects people, teams, projects, documents, tickets, chats and decisions.

Rules:
- Always ground answers in the graph. Use tools before answering; never invent people, owners or decisions.
- Node ids look like "person:diego", "decision:postgres-ledger". Use search_graph to find ids, explore_node to follow relationships.
- For "who owns / who knows" questions use who_owns_or_knows. For "why did we…" questions find the decision and use trace_decision.
- Every factual claim must cite its source. End each answer with a **Sources** list of markdown links: [Node name](url) when a url exists, otherwise the node name and id in backticks. Mention how recent a source is when it matters.
- If a node is "superseded", say so and point to the current one.
- When the user tells you something changed (new owner, new decision, status update), call record_update to keep the graph current, linking it to related nodes and superseding outdated nodes. The user must approve it.
- Use list_stale when asked what knowledge may be out of date.
- Be concise. Use short paragraphs or bullets.`;

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
}

export async function handleChat(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey || !url || !anon) return json(500, "Server is not configured.");

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "Please sign in.");
  const db = createClient<Database>(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData.user) return json(401, "Please sign in.");
  const userId = userData.user.id;

  let body: { messages?: UIMessage[]; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Invalid request.");
  }
  const messages = body.messages;
  const threadId = body.threadId;
  if (!Array.isArray(messages) || !threadId) return json(400, "Missing messages or thread.");

  const { data: thread } = await db.from("chat_threads").select("id,title").eq("id", threadId).maybeSingle();
  if (!thread) return json(404, "Conversation not found.");

  const tools = {
    search_graph: tool({
      description: "Full-text search across all nodes (people, teams, projects, documents, tickets, chats, decisions). Optional type filter.",
      inputSchema: z.object({ query: z.string(), type: z.string().nullable() }),
      execute: ({ query, type }) => searchGraph(db, query, type),
    }),
    explore_node: tool({
      description: "Get one node's full content and all its relationships (with evidence sources).",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => exploreNode(db, id),
    }),
    who_owns_or_knows: tool({
      description: "Find the people who own, work on, decided, or have expertise about a topic.",
      inputSchema: z.object({ topic: z.string() }),
      execute: ({ topic }) => whoOwnsOrKnows(db, topic),
    }),
    trace_decision: tool({
      description: "Trace a decision node back to who made it, what it affects and the original source docs/chats.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => traceDecision(db, id),
    }),
    list_stale: tool({
      description: "List current knowledge that has not been updated in N days and may be out of date.",
      inputSchema: z.object({ days: z.number() }),
      execute: ({ days }) => listStale(db, days),
    }),
    record_update: tool({
      description:
        "Add or update knowledge in the graph. Use id=null to create a new node. Use supersedes_id to mark an older node as outdated. links connect the new node to existing node ids (rel like OWNS, AFFECTS, ASSIGNED_TO, ABOUT, DECIDED_BY).",
      inputSchema: z.object({
        id: z.string().nullable(),
        type: z.string(),
        name: z.string(),
        summary: z.string(),
        content: z.string(),
        source_note: z.string(),
        links: z.array(z.object({ rel: z.string(), target_id: z.string() })),
        supersedes_id: z.string().nullable(),
      }),
      needsApproval: true,
      execute: (input) => recordUpdate(db, input),
    }),
  };

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: isStepCount(50),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onError: (e) => {
      console.error("chat error", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/402|credit/i.test(msg)) return "AI credits are used up. Add credits in workspace settings to keep chatting.";
      if (/429|rate/i.test(msg)) return "Too many requests right now. Please wait a moment and try again.";
      return "Something went wrong while answering. Please try again.";
    },
    onFinish: async ({ messages: all }) => {
      const rows = all.map((m) => ({ thread_id: threadId, user_id: userId, message_id: m.id, message: m as never }));
      const { error } = await db.from("chat_messages").upsert(rows, { onConflict: "thread_id,message_id" });
      if (error) console.error("Failed to save messages", error);
      const firstUser = all.find((m) => m.role === "user");
      const text = firstUser?.parts.find((p) => p.type === "text") as { text?: string } | undefined;
      const patch: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
      if (thread.title === "New conversation" && text?.text) patch.title = text.text.slice(0, 60);
      const { error: tErr } = await db.from("chat_threads").update(patch).eq("id", threadId);
      if (tErr) console.error("Failed to update thread", tErr);
    },
  });
  return withLovableAiGatewayRunIdHeader(response, runIdFetch);
}
