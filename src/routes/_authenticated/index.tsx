import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownCircle, CheckCircle2, Clock, Coins, CreditCard, Plus, Wallet, Check, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodFilter, defaultPeriod, inRange, range, type Period } from "@/components/PeriodFilter";
import { brl, fmtDate, mesLabel, setPaid, txDate, txLabel, useFin, useRefresh, type Row } from "@/lib/data";
import { monthsBetween, todayIso } from "@/lib/engine";
import { openLancamento } from "@/lib/ui";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Controle de Financeiro" },
      { name: "description", content: "Renda, custos, saldo, parcelas e vencimentos da família em um só painel." },
      { property: "og:title", content: "Dashboard — Controle de Financeiro" },
      { property: "og:description", content: "Renda, custos, saldo, parcelas e vencimentos da família em um só painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const PALETTE = ["var(--highlight)", "var(--balance)", "var(--income)", "var(--expense)", "var(--pending)", "#818cf8", "#f472b6", "#22d3ee"];
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }, formatter: (v: number) => brl(v) };
const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

function sumBy(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + r.valor));
  return [...m.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
}
const total = (rows: Row[]) => rows.reduce((s, r) => s + r.valor, 0);

function Dashboard() {
  const { data, isLoading, error } = useFin();
  const [p, setP] = useState<Period>(defaultPeriod);
  const [resp, setResp] = useState("all");
  const refresh = useRefresh();
  const [payingId, setPayingId] = useState<string | null>(null);

  const calc = useMemo(() => {
    if (!data) return null;
    const r = range(p);
    const base = data.rows.filter((x) => resp === "all" || x.tx.responsavel === resp);
    const per = base.filter((x) => inRange(x.inst.mes_vencimento, r));
    const custos = per.filter((x) => x.mov === "Custo");
    const rendas = per.filter((x) => x.mov === "Renda");
    const evoRange = p.mode === "mes" ? monthsBetween(`${p.year}-01`, `${p.year}-12`) : monthsBetween(r[0], r[1]);
    let acc = 0;
    const evo = evoRange.map((m) => {
      const ms = base.filter((x) => x.inst.mes_vencimento === m);
      const rec = total(ms.filter((x) => x.mov === "Renda")), cus = total(ms.filter((x) => x.mov === "Custo"));
      acc += rec - cus;
      return { mes: mesLabel(m), Receitas: rec, Custos: cus, Saldo: rec - cus, Acumulado: acc };
    });
    const seen = new Set<string>();
    const ultimos = [...per].sort((a, b) => txDate(b.tx).localeCompare(txDate(a.tx)) || b.tx.created_at.localeCompare(a.tx.created_at))
      .filter((x) => !seen.has(x.tx.id) && seen.add(x.tx.id)).slice(0, 8);
    return {
      renda: total(rendas), custo: total(custos),
      fixa: total(rendas.filter((x) => x.tx.tipo_renda === "Fixa")), variavel: total(rendas.filter((x) => x.tx.tipo_renda !== "Fixa")),
      pago: total(custos.filter((x) => x.status === "Pago")), pend: total(custos.filter((x) => x.status === "Pendente")), atras: total(custos.filter((x) => x.status === "Atrasado")),
      cat: sumBy(custos, (x) => x.tx.categoria || "Sem categoria"),
      quinz: sumBy(custos, (x) => x.inst.quinzena).sort((a, b) => a.name.localeCompare(b.name)),
      pag: sumBy(custos, (x) => x.tx.tipo_pagamento || "—"),
      natasha: sumBy(data.rows.filter((x) => inRange(x.inst.mes_vencimento, r) && x.mov === "Renda" && x.tx.responsavel === "Natasha" && x.tx.tipo_renda === "Variável"), (x) => x.tx.descricao || "Outros"),
      porResp: data.responsaveis.map((u) => {
        const rs = rendas.filter((x) => x.tx.responsavel === u.nome);
        return { nome: u.nome, fixa: total(rs.filter((x) => x.tx.tipo_renda === "Fixa")), variavel: total(rs.filter((x) => x.tx.tipo_renda !== "Fixa")) };
      }).filter((x) => x.fixa + x.variavel > 0 || resp === "all"),
      vencimentos: sumBy(custos, (x) => x.inst.data_vencimento.slice(8, 10)).sort((a, b) => Number(a.name) - Number(b.name)),
      proximoVencimento: (() => {
        const hoje = todayIso();
        const futuros = custos.filter((x) => x.inst.data_vencimento >= hoje).sort((a, b) => a.inst.data_vencimento.localeCompare(b.inst.data_vencimento));
        if (!futuros.length) return null;
        const data = futuros[0]!.inst.data_vencimento;
        return { data, valor: total(futuros.filter((x) => x.inst.data_vencimento === data)) };
      })(),
      maiores: sumBy(custos, (x) => x.tx.descricao?.trim() || "Sem descrição").slice(0, 6),
      evo, ultimos,
    };
  }, [data, p, resp]);

  if (error) return <div className="panel p-6 text-overdue">Erro ao carregar: {(error as Error).message}</div>;
  if (isLoading || !calc || !data) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  const saldo = calc.renda - calc.custo;
  const hoje = todayIso();
  const limite = (() => { const d = new Date(hoje + "T12:00:00"); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10); })();
  const proximos = data.rows.filter((x) => x.mov === "Custo" && (resp === "all" || x.tx.responsavel === resp) && x.status === "Pendente" && x.inst.data_vencimento >= hoje && x.inst.data_vencimento <= limite).sort((a, b) => a.inst.data_vencimento.localeCompare(b.inst.data_vencimento));
  const marcarPago = async (row: Row) => { setPayingId(row.inst.id); try { await setPaid(row.inst, true, hoje, row.tx); await refresh(); } finally { setPayingId(null); } };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="glow grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground"><Wallet className="h-6 w-6" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Controle de Financeiro</h1>
            <p className="text-sm text-muted-foreground">Organização hoje, tranquilidade amanhã ✨</p>
          </div>
        </div>
        <button onClick={() => openLancamento()} className="glow hidden items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground md:flex"><Plus className="h-4 w-4" />Novo lançamento</button>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <PeriodFilter p={p} setP={setP} />
        <div className="panel flex items-center gap-2 p-3 lg:flex-col lg:items-stretch">
          <span className="text-xs text-muted-foreground">Responsável</span>
          <Select value={resp} onValueChange={setResp}>
            <SelectTrigger className="h-9 w-44 bg-muted"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem>{data.responsaveis.map((u) => <SelectItem key={u.id} value={u.nome}>{u.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {proximos.length > 0 && (
        <section className="panel overflow-hidden border-amber-500/40 bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /><div><h2 className="font-display font-semibold">Pagamentos Próximos do Vencimento</h2><p className="text-xs text-muted-foreground">Pendentes para hoje e os próximos 5 dias.</p></div></div>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600">{proximos.length} parcela{proximos.length === 1 ? "" : "s"}</span>
          </div>
          <div className="divide-y divide-border">
            {proximos.map((x) => {
              const dias = Math.round((new Date(x.inst.data_vencimento + "T12:00:00").getTime() - new Date(hoje + "T12:00:00").getTime()) / 86400000);
              const urgente = dias <= 1;
              return <div key={x.inst.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${urgente ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600"}`}><Clock className="h-4 w-4" /></div>
                <div className="min-w-40 flex-1"><div className="font-semibold">{txLabel(x.tx)}</div><div className="text-xs text-muted-foreground">{x.tx.responsavel} · {x.tx.tipo_pagamento || "—"} · parcela {x.inst.numero_parcela}/{x.inst.total_parcelas}</div></div>
                <div className="text-right"><div className="font-bold text-expense">{brl(x.valor)}</div><div className={`text-xs font-semibold ${urgente ? "text-red-500" : "text-amber-600"}`}>{dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : "vence em " + dias + " dias"} · {fmtDate(x.inst.data_vencimento)}</div></div>
                <button disabled={payingId === x.inst.id} onClick={() => marcarPago(x)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />{payingId === x.inst.id ? "Salvando…" : "Marcar como Pago"}</button>
              </div>;
            })}
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Coins} label="Renda" value={calc.renda} color="var(--income)" sub={`Fixa ${brl(calc.fixa)} · Var. ${brl(calc.variavel)}`} />
        <Kpi icon={ArrowDownCircle} label="Custos" value={calc.custo} color="var(--expense)" />
        <Kpi icon={CreditCard} label="Saldo" value={saldo} color={saldo >= 0 ? "var(--balance)" : "var(--overdue)"} />
        <Kpi icon={Clock} label="A pagar" value={calc.pend} color="var(--pending)" />
        <Kpi icon={AlertTriangle} label="Atrasado" value={calc.atras} color="var(--overdue)" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Categorias de Custos" className="lg:row-span-2">
          <BarList items={calc.cat} />
        </Panel>
        <Panel title="Quinzena"><Donut items={calc.quinz} colors={["var(--balance)", "var(--expense)"]} /></Panel>
        <Panel title="Tipo de Pagamento"><Donut items={calc.pag} /></Panel>
        <Panel title="Pagamentos e Vencimentos">
          <div className="space-y-3 pt-1">
            {([["Pagos", calc.pago, "var(--paid)", CheckCircle2], ["No prazo", calc.pend, "var(--pending)", Clock], ["Atrasado", calc.atras, "var(--overdue)", AlertTriangle]] as const).map(([l, v, c, I]) => {
              const t = calc.pago + calc.pend + calc.atras || 1;
              return (
                <div key={l}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><I className="h-4 w-4" style={{ color: c }} />{l}</span><span className="font-semibold">{brl(v)}</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(v / t) * 100}%`, background: c, boxShadow: `0 0 10px ${c}` }} /></div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Renda Variável Natasha">
          {calc.natasha.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(160, calc.natasha.length * 34)}>
              <BarChart data={calc.natasha} layout="vertical" margin={{ left: 0, right: 50 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={80} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="value" fill="var(--income)" radius={[0, 6, 6, 0]} label={{ position: "right", fill: "var(--foreground)", fontSize: 11, formatter: (v: number) => brl(v) }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Evolução do Saldo" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={calc.evo} margin={{ left: -10, right: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={k} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Receitas" stroke="var(--income)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Custos" stroke="var(--expense)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Saldo" stroke="var(--balance)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Renda por Responsável">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left font-medium">Pessoa</th><th className="text-right font-medium">Fixa</th><th className="text-right font-medium">Variável</th></tr></thead>
            <tbody>{calc.porResp.map((x) => <tr key={x.nome} className="border-t border-border"><td className="py-2">{x.nome}</td><td className="text-right">{brl(x.fixa)}</td><td className="text-right text-income">{brl(x.variavel)}</td></tr>)}</tbody>
          </table>
          <div className="mt-3 border-t border-border pt-3">
            <Donut items={calc.porResp.map((x) => ({ name: x.nome, value: x.fixa + x.variavel }))} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Despesas por Dia de Vencimento" className="lg:col-span-2">
          <div className="mb-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Clock className="h-4 w-4 text-pending" />Próximo vencimento</div>
            {calc.proximoVencimento ? (
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="font-display text-lg font-bold">{fmtDate(calc.proximoVencimento.data)}</div>
                <div className="text-sm font-semibold text-expense">{brl(calc.proximoVencimento.valor)}</div>
              </div>
            ) : <div className="mt-1 text-sm text-muted-foreground">Nenhum vencimento futuro no período.</div>}
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={calc.vencimentos} margin={{ left: -10, right: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickFormatter={(v) => `Dia ${v}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={k} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="value" name="Despesas" fill="var(--expense)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Maiores Gastos">
          {calc.maiores.length === 0 ? <Empty /> : (
            <ol className="space-y-2">
              {calc.maiores.map((m, i) => (
                <li key={m.name} className="flex items-center gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold">{i + 1}</span>
                  <span className="flex-1 truncate">{m.name}</span><span className="font-semibold text-expense">{brl(m.value)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Últimos Lançamentos" action={<Link to="/transacoes" className="text-sm font-semibold text-highlight">Ver todos →</Link>}>
        {calc.ultimos.length === 0 ? <Empty /> : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr>{["Data", "Mov.", "Descrição", "Categoria", "Tipo", "Valor", "Pagamento", "Vencimento", "Responsável"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {calc.ultimos.map(({ tx, inst, valor }) => (
                  <tr key={inst.id} className="border-t border-border">
                    <td className="py-2 pr-3">{fmtDate(txDate(tx))}</td>
                    <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tx.tipo_movimentacao === "Renda" ? "bg-income/15 text-income" : "bg-expense/15 text-expense"}`}>{tx.tipo_movimentacao}</span></td>
                    <td className="pr-3">{tx.descricao || "—"}</td><td className="pr-3">{tx.categoria || "—"}</td>
                    <td className="pr-3">{tx.tipo_gasto || tx.tipo_renda || "—"}</td>
                    <td className="pr-3 font-semibold">{brl(valor)}{inst.total_parcelas > 1 && <span className="ml-1 text-xs text-muted-foreground">{inst.numero_parcela}/{inst.total_parcelas}</span>}</td>
                    <td className="pr-3">{tx.tipo_pagamento || "—"}</td><td className="pr-3">{fmtDate(inst.data_vencimento)}</td><td>{tx.responsavel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Kpi({ icon: I, label, value, color, sub }: { icon: LucideIcon; label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="panel relative overflow-hidden p-4" style={{ ["--glow" as string]: color }}>
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-25 blur-2xl" style={{ background: color }} />
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}><I className="h-4 w-4" /></span>{label}</div>
      <div className="mt-2 font-display text-xl font-bold md:text-2xl" style={{ color }}>{brl(value)}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
function Panel({ title, children, className = "", action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return <section className={`panel min-w-0 p-4 ${className}`}><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-semibold">{title}</h2>{action}</div>{children}</section>;
}
const Empty = () => <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>;

function BarList({ items }: { items: { name: string; value: number }[] }) {
  if (!items.length) return <Empty />;
  const max = items[0]!.value || 1;
  return (
    <div className="space-y-2.5">
      {items.map((c, i) => (
        <div key={c.name}>
          <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{c.name}</span><span className="font-semibold">{brl(c.value)}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(c.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></div>
        </div>
      ))}
    </div>
  );
}
function Donut({ items, colors = PALETTE }: { items: { name: string; value: number }[]; colors?: string[] }) {
  if (!items.length) return <Empty />;
  const t = items.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex items-center gap-3">
      <div className="h-36 w-36 shrink-0">
        <ResponsiveContainer><PieChart><Pie data={items} dataKey="value" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
          {items.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {items.map((x, i) => (
          <li key={x.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
            <span className="flex-1 truncate">{x.name}</span>
            <span className="text-right"><b>{brl(x.value)}</b> <span className="text-muted-foreground">{((x.value / t) * 100).toFixed(0)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
// Area/AreaChart import kept out of bundle
void Area; void AreaChart;
