import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { LogOut, MessageSquare, Network, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createThread } from "@/lib/threads";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import mark from "@/assets/cortex-mark.png";

export const threadsKey = ["threads"];

export function AppShell({ children, activeThreadId }: { children: ReactNode; activeThreadId?: string }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const threads = useQuery({
    queryKey: threadsKey,
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_threads").select("id,title,updated_at").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function newThread() {
    if (!session) return;
    const id = await createThread(session.user.id);
    await threads.refetch();
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
  }

  async function remove(id: string) {
    await supabase.from("chat_threads").delete().eq("id", id);
    const res = await threads.refetch();
    if (id === activeThreadId) {
      const next = res.data?.[0]?.id;
      if (next) navigate({ to: "/chat/$threadId", params: { threadId: next } });
      else newThread();
    }
  }

  if (!session) return null;

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src={mark} alt="Cortex" width={32} height={32} className="size-8" />
          <div>
            <div className="font-display text-lg font-semibold leading-none">Cortex</div>
            <div className="text-xs text-muted-foreground">Northwind Labs brain</div>
          </div>
        </div>
        <div className="space-y-1 px-3">
          <Button className="w-full justify-start" onClick={newThread}>
            <Plus /> New conversation
          </Button>
          <Link
            to="/graph"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
            activeProps={{ className: "bg-sidebar-accent font-medium" }}
          >
            <Network className="size-4" /> Knowledge graph
          </Link>
        </div>
        <div className="mt-4 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Conversations</div>
        <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
          {threads.data?.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center rounded-md text-sm hover:bg-sidebar-accent",
                t.id === activeThreadId && "bg-sidebar-accent font-medium",
              )}
            >
              <Link to="/chat/$threadId" params={{ threadId: t.id }} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.title}</span>
              </Link>
              <button
                type="button"
                aria-label="Delete conversation"
                onClick={() => remove(t.id)}
                className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="truncate">{session.user.email}</span>
          <button type="button" aria-label="Sign out" onClick={() => supabase.auth.signOut()} className="hover:text-foreground">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
