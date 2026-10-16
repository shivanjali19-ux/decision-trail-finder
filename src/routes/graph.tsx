import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Knowledge graph — Cortex" },
      { name: "description", content: "Browse every person, team, project, document, ticket, chat and decision and how they connect." },
      { property: "og:title", content: "Knowledge graph — Cortex" },
      { property: "og:description", content: "Browse how your company's knowledge connects." },
    ],
  }),
  component: GraphPage,
});

const TYPE_COLOR: Record<string, string> = {
  person: "bg-node-person",
  team: "bg-node-team",
  project: "bg-node-project",
  document: "bg-node-document",
  ticket: "bg-node-ticket",
  chat: "bg-node-chat",
  decision: "bg-node-decision",
};

function daysAgo(d: string) {
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return n === 0 ? "today" : `${n}d ago`;
}

function GraphPage() {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["graph"],
    enabled: !!session,
    queryFn: async () => {
      const [n, e] = await Promise.all([
        supabase.from("kg_nodes").select("*").order("type"),
        supabase.from("kg_edges").select("src,rel,dst,source_id"),
      ]);
      if (n.error) throw n.error;
      if (e.error) throw e.error;
      return { nodes: n.data, edges: e.data };
    },
  });

  const byId = useMemo(() => new Map((data.data?.nodes ?? []).map((n) => [n.id, n])), [data.data]);
  const filtered = (data.data?.nodes ?? []).filter(
    (n) => (!type || n.type === type) && (!q || `${n.name} ${n.summary}`.toLowerCase().includes(q.toLowerCase())),
  );
  const sel = selected ? byId.get(selected) : null;
  const rels = (data.data?.edges ?? []).filter((e) => e.src === selected || e.dst === selected);
  const types = Object.keys(TYPE_COLOR);

  return (
    <AppShell>
      <div className="flex h-full min-h-0">
        <section className="flex w-[420px] shrink-0 flex-col border-r">
          <div className="space-y-3 border-b p-4">
            <h1 className="text-2xl font-semibold">Knowledge graph</h1>
            <p className="text-sm text-muted-foreground">
              {data.data?.nodes.length ?? 0} nodes · {data.data?.edges.length ?? 0} relationships
            </p>
            <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(type === t ? null : t)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs capitalize",
                    type === t && "border-primary bg-accent/40",
                  )}
                >
                  <span className={cn("size-2 rounded-full", TYPE_COLOR[t])} /> {t}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setSelected(n.id)}
                  className={cn("flex w-full items-start gap-3 border-b px-4 py-3 text-left hover:bg-muted", selected === n.id && "bg-muted")}
                >
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", TYPE_COLOR[n.type] ?? "bg-muted-foreground")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.summary}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{n.status === "superseded" ? "outdated" : daysAgo(n.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex-1 overflow-y-auto bg-graph-paper p-8">
          {!sel ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">Select a node to see how it connects.</div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{sel.type}</Badge>
                {sel.status === "superseded" && <Badge variant="destructive">Superseded</Badge>}
                <span className="font-mono text-xs text-muted-foreground">{sel.id}</span>
              </div>
              <h2 className="mt-3 text-3xl font-semibold">{sel.name}</h2>
              <p className="mt-1 text-muted-foreground">{sel.summary}</p>
              {sel.content && <p className="mt-4 rounded-lg border bg-card p-4 text-sm leading-relaxed">{sel.content}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Updated {daysAgo(sel.updated_at)}</p>
              <h3 className="mt-8 text-lg font-semibold">Relationships</h3>
              <ul className="mt-3 space-y-2">
                {rels.map((r, i) => {
                  const other = r.src === selected ? r.dst : r.src;
                  const o = byId.get(other);
                  const ev = r.source_id ? byId.get(r.source_id) : null;
                  return (
                    <li key={i} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{r.src === selected ? `→ ${r.rel}` : `← ${r.rel}`}</span>
                      <button type="button" onClick={() => setSelected(other)} className="flex items-center gap-2 font-medium hover:text-primary">
                        <span className={cn("size-2 rounded-full", TYPE_COLOR[o?.type ?? ""])} /> {o?.name ?? other}
                      </button>
                      {ev && <span className="ml-auto truncate text-xs text-muted-foreground">via {ev.name}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
