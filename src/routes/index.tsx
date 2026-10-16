import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateLatestThread } from "@/lib/threads";
import mark from "@/assets/cortex-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cortex — Company Brain AI Agent" },
      { name: "description", content: "Ask who owns what, who knows what, and why decisions were made — answers with sources from docs, tickets and chats." },
      { property: "og:title", content: "Cortex — Company Brain AI Agent" },
      { property: "og:description", content: "One graph of people, teams, projects, documents and decisions." },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    if (started.current) return;
    started.current = true;
    getOrCreateLatestThread(session.user.id).then((id) => navigate({ to: "/chat/$threadId", params: { threadId: id } }));
  }, [session, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-graph-paper">
      <img src={mark} alt="" width={64} height={64} className="size-16 animate-pulse" />
    </div>
  );
}
