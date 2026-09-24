import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Download, Settings, Wallet, Plus, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { openLancamento } from "@/lib/ui";
import { LancamentoDialog } from "./LancamentoDialog";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transacoes", label: "Transações", icon: ListChecks },
  { to: "/importar", label: "Importar", icon: Download },
  { to: "/configuracoes", label: "Config", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const sair = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-border bg-muted/70 p-4 backdrop-blur md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="glow grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Wallet className="h-5 w-5" /></div>
          <div className="font-display text-sm font-bold leading-tight">Controle<br />de Financeiro</div>
        </div>
        <button onClick={() => openLancamento()} className="glow mb-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Novo lançamento
        </button>
        {nav.map((n) => (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            activeProps={{ className: "bg-accent !text-foreground" }}>
            <n.icon className="h-4 w-4" />{n.label}
          </Link>
        ))}
        <button onClick={sair} className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"><LogOut className="h-4 w-4" />Sair</button>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-28 md:p-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-border bg-muted/95 backdrop-blur md:hidden">
        {nav.slice(0, 2).map((n) => <MobileLink key={n.to} {...n} />)}
        <button onClick={() => openLancamento()} aria-label="Novo lançamento" className="mx-auto -mt-6 mb-2 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground glow"><Plus className="h-6 w-6" /></button>
        {nav.slice(2).map((n) => <MobileLink key={n.to} {...n} />)}
      </nav>
      <LancamentoDialog />
    </div>
  );
}

function MobileLink({ to, label, icon: Icon }: (typeof nav)[number]) {
  return (
    <Link to={to} activeOptions={{ exact: to === "/" }} className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "!text-foreground" }}>
      <Icon className="h-5 w-5" />{label}
    </Link>
  );
}
