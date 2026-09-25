import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Controle de Financeiro" },
      { name: "description", content: "Acesse o controle financeiro da família." },
      { property: "og:title", content: "Entrar — Controle de Financeiro" },
      { property: "og:description", content: "Acesse o controle financeiro da família." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/" }); }); }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error; nav({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error; toast.success("Conta criada! Confira seu e-mail para confirmar.");
      }
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return toast.error(r.error.message);
    if (!r.redirected) nav({ to: "/" });
  }
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="panel w-full max-w-sm space-y-5 p-6">
        <div className="flex items-center gap-3">
          <div className="glow grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Wallet className="h-5 w-5" /></div>
          <div><h1 className="font-display text-lg font-bold">Controle de Financeiro</h1><p className="text-xs text-muted-foreground">Organização hoje, tranquilidade amanhã ✨</p></div>
        </div>
        <Button variant="secondary" className="w-full" onClick={google}>Continuar com Google</Button>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5"><Label>E-mail</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Senha</Label><Input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <Button type="submit" disabled={busy}>{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <button className="w-full text-center text-xs text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
