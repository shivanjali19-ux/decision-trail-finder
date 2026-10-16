import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import mark from "@/assets/cortex-mark.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Cortex" },
      { name: "description", content: "Sign in to Cortex, your company brain." },
      { property: "og:title", content: "Sign in — Cortex" },
      { property: "og:description", content: "Sign in to Cortex, your company brain." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "up" && !data.session) toast.success("Check your email to confirm your account.");
  }

  async function oauth(provider: "google" | "lovable") {
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Sign-in failed");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-graph-paper px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <img src={mark} alt="Cortex" width={56} height={56} className="mb-4 size-14" />
        <h1 className="text-3xl font-semibold">Cortex</h1>
        <p className="mt-1 text-sm text-muted-foreground">The brain behind how your company works.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="my-4 text-center text-xs text-muted-foreground">or</div>
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => oauth("google")}>Continue with Google</Button>
          <button type="button" className="lovable-auth-button w-full" onClick={() => oauth("lovable")}>Continue with Lovable</button>
        </div>
        <button type="button" className="mt-6 w-full text-sm text-primary underline-offset-4 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
