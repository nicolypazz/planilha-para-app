import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Plus, History, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LancamentoDialog } from "@/components/LancamentoDialog";
import { Filters, allF, applyF } from "@/components/Filters";
import { brl, groupSum, mesLabel, parcelas, useFinance } from "@/lib/finance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Controle Financeiro" },
      { name: "description", content: "Renda, custos, saldo e status dos pagamentos em um só painel." },
      { property: "og:title", content: "Dashboard — Controle Financeiro" },
      { property: "og:description", content: "Renda, custos, saldo e status dos pagamentos em um só painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#9f9ec0", "#6d58a0"];
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }, formatter: (v: number) => brl(v) };

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 ${className}`}>
      <h3 className="mb-3 font-display text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Dashboard() {
  const { lancamentos, config } = useFinance();
  const [f, setF] = useState(allF);
  const [open, setOpen] = useState(false);
  const all = useMemo(() => parcelas(lancamentos, config), [lancamentos, config]);
  const ps = applyF(all, f);
  const custos = ps.filter((p) => p.lanc.mov === "Custo");
  const rendas = ps.filter((p) => p.lanc.mov === "Renda");
  const totC = custos.reduce((s, p) => s + p.valor, 0);
  const totR = rendas.reduce((s, p) => s + p.valor, 0);
  const st = (s: string) => custos.filter((p) => p.status === s).reduce((a, p) => a + p.valor, 0);

  const porCat = groupSum(custos, (p) => p.lanc.categoria, (p) => p.valor);
  const porPag = groupSum(custos, (p) => p.lanc.pagamento, (p) => p.valor);
  const custoRenda = [{ name: "Custo", value: totC }, { name: "Renda", value: totR }];
  const rendaResp = config.responsaveis.map((r) => ({
    name: r,
    Fixa: rendas.filter((p) => p.lanc.responsavel === r && p.lanc.tipo === "Fixa").reduce((s, p) => s + p.valor, 0),
    Variável: rendas.filter((p) => p.lanc.responsavel === r && p.lanc.tipo === "Variável").reduce((s, p) => s + p.valor, 0),
  }));
  const mensal = [...new Set(ps.map((p) => p.mesRef))].sort().map((m) => ({
    name: mesLabel(m),
    Custo: custos.filter((p) => p.mesRef === m).reduce((s, p) => s + p.valor, 0),
    Renda: rendas.filter((p) => p.mesRef === m).reduce((s, p) => s + p.valor, 0),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Visão geral</p>
          <h1 className="font-display text-3xl font-bold">Controle de financeiro</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Novo lançamento</Button>
          <Button asChild variant="secondary"><Link to="/lancamentos"><History className="mr-1 h-4 w-4" />Ver histórico</Link></Button>
          <Button asChild variant="secondary"><Link to="/relatorios"><FileBarChart className="mr-1 h-4 w-4" />Relatórios</Link></Button>
        </div>
      </header>

      <Filters f={f} setF={setF} ps={all} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { l: "Renda", v: totR, c: "text-success" },
          { l: "Custos", v: totC, c: "text-destructive" },
          { l: "Saldo", v: totR - totC, c: totR - totC >= 0 ? "text-success" : "text-destructive" },
          { l: "Pagos", v: st("Pago"), c: "text-chart-2" },
          { l: "No prazo", v: st("No Prazo"), c: "text-warning" },
          { l: "Atrasado", v: st("Atrasado"), c: "text-destructive" },
        ].map((k) => (
          <div key={k.l} className="rounded-2xl border border-border bg-gradient-to-br from-card to-secondary p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.l}</p>
            <p className={`mt-1 font-display text-xl font-bold ${k.c}`}>{brl(k.v)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Custo x Renda">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={custoRenda} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} stroke="none">
              <Cell fill="var(--chart-1)" /><Cell fill="var(--chart-2)" /></Pie><Tooltip {...tip} /><Legend /></PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Gasto por categoria" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porCat} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={140} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} /><Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Renda fixa e variável por responsável">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rendaResp}><XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)" }} /><YAxis hide />
              <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} /><Legend />
              <Bar dataKey="Fixa" stackId="a" fill="var(--chart-3)" /><Bar dataKey="Variável" stackId="a" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Gasto por tipo de pagamento">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={porPag} dataKey="value" nameKey="name" outerRadius={85} stroke="none">
              {porPag.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Evolução mensal (por vencimento)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mensal}><XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} /><YAxis hide />
              <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} /><Legend />
              <Bar dataKey="Renda" fill="var(--chart-2)" radius={[4, 4, 0, 0]} /><Bar dataKey="Custo" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <LancamentoDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
