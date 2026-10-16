import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Graph store for the company brain. Currently backed by Lovable Cloud tables
 * (kg_nodes / kg_edges). The agent only talks to this module, so it can be
 * swapped for a FalkorDB (Cypher) implementation without touching the agent.
 */
type DB = SupabaseClient<Database>;
type NodeRow = Database["public"]["Tables"]["kg_nodes"]["Row"];

const brief = (n: Pick<NodeRow, "id" | "type" | "name" | "summary" | "status" | "updated_at" | "props">) => ({
  id: n.id,
  type: n.type,
  name: n.name,
  summary: n.summary,
  status: n.status,
  updated_at: n.updated_at,
  url: (n.props as Record<string, unknown>)?.url ?? null,
});

const clean = (q: string) => q.replace(/[%,()]/g, " ").trim();

export async function searchGraph(db: DB, query: string, type?: string | null) {
  const words = clean(query).split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  const terms = words.length ? words : [clean(query)];
  const ors = terms.flatMap((w) => [`name.ilike.%${w}%`, `summary.ilike.%${w}%`, `content.ilike.%${w}%`]).join(",");
  let q = db.from("kg_nodes").select("id,type,name,summary,status,updated_at,props").or(ors).limit(15);
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { results: (data ?? []).map(brief) };
}

async function nodesById(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, NodeRow>();
  const { data, error } = await db.from("kg_nodes").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((n) => [n.id, n]));
}

export async function exploreNode(db: DB, id: string) {
  const { data: node, error } = await db.from("kg_nodes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!node) return { error: `No node with id ${id}` };
  const [{ data: out }, { data: inc }] = await Promise.all([
    db.from("kg_edges").select("src,rel,dst,source_id").eq("src", id),
    db.from("kg_edges").select("src,rel,dst,source_id").eq("dst", id),
  ]);
  const edges = [...(out ?? []), ...(inc ?? [])];
  const ids = [...new Set(edges.flatMap((e) => [e.src, e.dst, e.source_id].filter(Boolean) as string[]))];
  const map = await nodesById(db, ids);
  const label = (x: string | null) => (x ? { id: x, name: map.get(x)?.name ?? x, type: map.get(x)?.type } : null);
  return {
    node: { ...brief(node), content: node.content, props: node.props },
    relationships: edges.map((e) => ({
      from: label(e.src),
      rel: e.rel,
      to: label(e.dst),
      evidence: label(e.source_id),
    })),
  };
}

const OWNERSHIP = ["OWNS", "AUTHORED", "ASSIGNED_TO", "KNOWS_ABOUT", "LEADS", "DECIDED_BY", "PROPOSED_BY"];

export async function whoOwnsOrKnows(db: DB, topic: string) {
  const { results } = await searchGraph(db, topic);
  const ids = results.map((r) => r.id);
  const people = new Map<string, { id: string; name: string; summary: string; reasons: string[] }>();
  const add = (p: NodeRow | undefined, reason: string) => {
    if (!p || p.type !== "person") return;
    const e = people.get(p.id) ?? { id: p.id, name: p.name, summary: p.summary, reasons: [] };
    if (!e.reasons.includes(reason)) e.reasons.push(reason);
    people.set(p.id, e);
  };
  if (ids.length) {
    const [{ data: a }, { data: b }] = await Promise.all([
      db.from("kg_edges").select("src,rel,dst").in("dst", ids).in("rel", OWNERSHIP),
      db.from("kg_edges").select("src,rel,dst").in("src", ids).in("rel", OWNERSHIP),
    ]);
    const edges = [...(a ?? []), ...(b ?? [])];
    const map = await nodesById(db, [...new Set(edges.flatMap((e) => [e.src, e.dst]))]);
    for (const e of edges) {
      const s = map.get(e.src), d = map.get(e.dst);
      if (s?.type === "person") add(s, `${e.rel} ${d?.name ?? e.dst}`);
      if (d?.type === "person") add(d, `${s?.name ?? e.src} ${e.rel} them`);
    }
    for (const r of results) if (r.type === "person") add(map.get(r.id) ?? (await nodesById(db, [r.id])).get(r.id), "profile matches topic");
  }
  // expertise match
  const { data: experts } = await db.from("kg_nodes").select("*").eq("type", "person");
  const t = topic.toLowerCase();
  for (const p of experts ?? []) {
    const exp = ((p.props as { expertise?: string[] })?.expertise ?? []).filter((x) =>
      t.split(/\s+/).some((w) => w.length > 2 && x.toLowerCase().includes(w)),
    );
    if (exp.length) add(p, `expertise: ${exp.join(", ")}`);
  }
  return { topic, matched_nodes: results.slice(0, 8), people: [...people.values()] };
}

export async function traceDecision(db: DB, id: string) {
  const res = await exploreNode(db, id);
  if ("error" in res) return res;
  const sourceIds = res.relationships
    .filter((r) => ["SOURCED_FROM", "DOCUMENTED_IN"].includes(r.rel) && r.to)
    .map((r) => r.to!.id);
  const map = await nodesById(db, sourceIds);
  return {
    decision: res.node,
    people: res.relationships.filter((r) => ["DECIDED_BY", "PROPOSED_BY"].includes(r.rel)).map((r) => ({ role: r.rel, person: r.to })),
    affects: res.relationships.filter((r) => r.rel === "AFFECTS").map((r) => r.to),
    sources: [...map.values()].map((s) => ({ ...brief(s), excerpt: s.content })),
  };
}

export async function listStale(db: DB, days: number) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await db
    .from("kg_nodes")
    .select("id,type,name,summary,status,updated_at,props")
    .eq("status", "current")
    .lt("updated_at", cutoff)
    .order("updated_at")
    .limit(25);
  if (error) throw new Error(error.message);
  return { older_than_days: days, nodes: (data ?? []).map(brief) };
}

export type UpdateInput = {
  id: string | null;
  type: string;
  name: string;
  summary: string;
  content: string;
  source_note: string;
  links: { rel: string; target_id: string }[];
  supersedes_id: string | null;
};

export async function recordUpdate(db: DB, u: UpdateInput) {
  const id = u.id || `${u.type}:${u.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const { data: existing } = await db.from("kg_nodes").select("props").eq("id", id).maybeSingle();
  const props = { ...((existing?.props as object) ?? {}), source_note: u.source_note, recorded_via: "agent" };
  const { error } = await db.from("kg_nodes").upsert({
    id, type: u.type, name: u.name, summary: u.summary, content: u.content, props, status: "current", updated_at: now,
  });
  if (error) throw new Error(error.message);
  if (u.supersedes_id) {
    const { data: old } = await db.from("kg_nodes").select("props").eq("id", u.supersedes_id).maybeSingle();
    await db.from("kg_nodes").update({ status: "superseded", updated_at: now, props: { ...((old?.props as object) ?? {}), superseded_by: id } }).eq("id", u.supersedes_id);
    await db.from("kg_edges").upsert({ src: id, rel: "SUPERSEDES", dst: u.supersedes_id }, { onConflict: "src,rel,dst" });
  }
  for (const l of u.links) {
    const { error: e } = await db.from("kg_edges").upsert({ src: id, rel: l.rel.toUpperCase(), dst: l.target_id }, { onConflict: "src,rel,dst" });
    if (e) return { id, warning: `Saved node but link ${l.rel} → ${l.target_id} failed: ${e.message}` };
  }
  return { id, saved: true, superseded: u.supersedes_id };
}
