import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clock, FileSearch, GitBranch, Network, PenLine, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, threadsKey } from "@/components/AppShell";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import mark from "@/assets/cortex-mark.png";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation — Cortex" },
      { name: "description", content: "Ask the company brain about people, projects and decisions." },
      { property: "og:title", content: "Conversation — Cortex" },
      { property: "og:description", content: "Ask the company brain about people, projects and decisions." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { session } = useAuth();
  const history = useQuery({
    queryKey: ["messages", threadId],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("message").eq("thread_id", threadId).order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => r.message as unknown as UIMessage);
    },
  });

  return (
    <AppShell activeThreadId={threadId}>
      {history.data ? <ChatWindow key={threadId} threadId={threadId} initial={history.data} /> : null}
    </AppShell>
  );
}

const SUGGESTIONS = [
  "Who owns Ledger v2 and who else knows about it?",
  "Why did we choose Postgres for the ledger?",
  "What's blocking the payments-api Kubernetes migration?",
  "What knowledge hasn't been updated in the last 20 days?",
];

const TOOL_META: Record<string, { label: string; icon: typeof Network }> = {
  search_graph: { label: "Searched the graph", icon: FileSearch },
  explore_node: { label: "Followed relationships", icon: Network },
  who_owns_or_knows: { label: "Found owners & experts", icon: Users },
  trace_decision: { label: "Traced decision to source", icon: GitBranch },
  list_stale: { label: "Checked for stale knowledge", icon: Clock },
  record_update: { label: "Update the graph", icon: PenLine },
};

function ChatWindow({ threadId, initial }: { threadId: string; initial: UIMessage[] }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
        },
      }),
  );

  const { messages, sendMessage, status, stop, addToolApprovalResponse } = useChat({
    id: threadId,
    messages: initial,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (e) => {
      let msg = e.message;
      try {
        msg = JSON.parse(msg).error ?? msg;
      } catch {}
      toast.error(msg || "Something went wrong.");
    },
    onFinish: () => {
      qc.invalidateQueries({ queryKey: threadsKey });
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      textRef.current?.focus();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => textRef.current?.focus(), []);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
    textRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col bg-graph-paper">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <img src={mark} alt="" width={80} height={80} className="size-20" />
              <h1 className="mt-4 text-4xl font-semibold">What do you want to know?</h1>
              <p className="mt-2 max-w-md text-muted-foreground">
                I connect people, teams, projects, docs, tickets, chats and decisions — and cite where every answer comes from.
              </p>
              <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-lg border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-accent/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.parts.map((part, i) => {
                  if (part.type === "text") return <MessageResponse key={i}>{part.text}</MessageResponse>;
                  if (part.type === "reasoning") return null;
                  if (part.type.startsWith("tool-")) {
                    const p = part as Extract<UIMessage["parts"][number], { type: `tool-${string}` }> & {
                      toolCallId: string;
                      state: string;
                      input?: unknown;
                      output?: unknown;
                      errorText?: string;
                      approval?: { id: string };
                    };
                    const name = p.type.slice(5);
                    const meta = TOOL_META[name] ?? { label: name, icon: Network };
                    const Icon = meta.icon;
                    if (p.state === "approval-requested" && p.approval) {
                      const inp = p.input as { name?: string; summary?: string; supersedes_id?: string | null };
                      return (
                        <div key={i} className="rounded-lg border border-accent bg-accent/30 p-4 text-sm">
                          <div className="flex items-center gap-2 font-medium"><PenLine className="size-4" /> Save to the company brain?</div>
                          <div className="mt-2"><strong>{inp?.name}</strong> — {inp?.summary}</div>
                          {inp?.supersedes_id && <div className="mt-1 text-muted-foreground">Marks <code>{inp.supersedes_id}</code> as outdated.</div>}
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" onClick={() => addToolApprovalResponse({ id: p.approval!.id, approved: true })}><Check /> Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => addToolApprovalResponse({ id: p.approval!.id, approved: false })}><X /> Decline</Button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader
                          type={p.type as never}
                          state={p.state as never}
                          title={meta.label}
                          icon={<Icon className="size-4 text-primary" />}
                        />
                        <ToolContent>
                          <ToolInput input={p.input} />
                          <ToolOutput output={p.output as never} errorText={p.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && <Shimmer className="text-sm">Searching the company brain…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <PromptInput onSubmit={(m) => send(m.text)} className="bg-card">
          <PromptInputTextarea
            ref={textRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about owners, decisions, projects… or tell me what changed"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
