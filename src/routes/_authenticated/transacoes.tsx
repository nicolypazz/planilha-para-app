import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Pencil, Trash2, Copy, Search, CheckCircle2, Circle, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodFilter, defaultPeriod, inRange, range, type Period } from "@/components/PeriodFilter";
import { PayDialog } from "@/components/PayDialog";
import { brl, deleteTransaction, fmtDate, saveTransaction, txDate, txLabel, useFin, useRefresh, type Inst, type Tx } from "@/lib/data";
import { addMonths, statusOf, type Mov, type Status } from "@/lib/engine";
import { openLancamento } from "@/lib/ui";

export const Route = createFileRoute("/_authenticated/transacoes")({
  head: () => ({
    meta: [
      { title: "Transações — Controle de Financeiro" },
      { name: "description", content: "Todos os lançamentos, parcelas e pagamentos com filtros." },
      { property: "og:title", content: "Transações — Controle de Financeiro" },
      { property: "og:description", content: "Todos os lançamentos, parcelas e pagamentos com filtros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const F0 = { mov: "all", resp: "all", cat: "all", gasto: "all", renda: "all", pag: "all", status: "all", parc: "all", q: "" };
const statusStyle: Record<Status, string> = { Pago: "text-paid bg-paid/15", Pendente: "text-pending bg-pending/15", Atrasado: "text-overdue bg-overdue/15", Recebido: "text-income bg-income/15" };
const StatusIcon = ({ s }: { s: Status }) => s === "Pago" ? <CheckCircle2 className="h-4 w-4 text-paid" /> : s === "Atrasado" ? <AlertTriangle className="h-4 w-4 text-overdue" /> : s === "Pendente" ? <Clock className="h-4 w-4 text-pending" /> : <Circle className="h-4 w-4 text-income" />;

function Page() {
  const { data } = useFin();
  const refresh = useRefresh();
  const [p, setP] = useState<Period>(defaultPeriod);
  const [todo, setTodo] = useState(false);
  const [f, setF] = useState(F0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pay, setPay] = useState<{ inst: Inst; tx: Tx } | null>(null);

  const list = useMemo(() => {
    if (!data) return [];
    const r = range(p);
    const q = f.q.trim().toLowerCase();
    return data.txs.filter((t) => {
      const mov = t.tipo_movimentacao as Mov;
      const insts = todo ? t.installments : t.installments.filter((i) => inRange(i.mes_vencimento, r));
      if (!insts.length) return false;
      if (f.mov !== "all" && mov !== f.mov) return false;
      if (f.resp !== "all" && t.responsavel !== f.resp) return false;
      if (f.cat !== "all" && t.categoria !== f.cat) return false;
      if (f.gasto !== "all" && t.tipo_gasto !== f.gasto) return false;
      if (f.renda !== "all" && t.tipo_renda !== f.renda) return false;
      if (f.pag !== "all" && t.tipo_pagamento !== f.pag) return false;
      if (f.parc !== "all" && (t.numero_parcelas > 1) !== (f.parc === "sim")) return false;
      if (f.status !== "all" && !insts.some((i) => statusOf(i, mov) === f.status)) return false;
      if (q && ![t.descricao, t.categoria, t.tipo_pagamento, t.responsavel].some((s) => s?.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => txDate(b).localeCompare(txDate(a)));
  }, [data, p, todo, f]);

  if (!data) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  const S = ({ k, ph, opts }: { k: keyof typeof F0; ph: string; opts: string[] }) => (
    <Select value={f[k]} onValueChange={(v) => setF({ ...f, [k]: v })}>
      <SelectTrigger className="h-9 bg-card"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">{ph}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
  const totR = list.filter((t) => t.tipo_movimentacao === "Renda").reduce((s, t) => s + Number(t.valor_total), 0);
  const totC = list.filter((t) => t.tipo_movimentacao === "Custo").reduce((s, t) => s + Number(t.valor_total), 0);

  async function remove(t: Tx) {
    if (!confirm(`Excluir "${txLabel(t)}"${t.numero_parcelas > 1 ? ` e suas ${t.numero_parcelas} parcelas` : ""}?`)) return;
    try { await deleteTransaction(t.id); await refresh(); toast.success("Lançamento excluído"); } catch (e) { toast.error((e as Error).message); }
  }
  async function duplicate(t: Tx) {
    try {
      await saveTransaction({ ...t, id: undefined, tipo_movimentacao: t.tipo_movimentacao as Mov, valor_total: Number(t.valor_total),
        data_compra: t.data_compra && addMonths(t.data_compra, 1), data_recebimento: t.data_recebimento && addMonths(t.data_recebimento, 1) }, data!.methods);
      await refresh(); toast.success("Copiado para o mês seguinte");
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="font-display text-3xl font-bold">Transações</h1><p className="text-sm text-muted-foreground">{list.length} lançamentos · Renda {brl(totR)} · Custos {brl(totC)} (valores totais)</p></div>
        <Button onClick={() => openLancamento()}>+ Novo lançamento</Button>
      </div>
      <div className={todo ? "opacity-50" : ""}><PeriodFilter p={p} setP={(x) => { setTodo(false); setP(x); }} /></div>
      <div className="panel space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 bg-card pl-8" placeholder="Buscar descrição, categoria…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} />Todo o período</label>
          <Button variant="ghost" size="sm" onClick={() => setF(F0)}>Limpar filtros</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <S k="mov" ph="Renda e custo" opts={["Renda", "Custo"]} />
          <S k="resp" ph="Responsáveis" opts={data.responsaveis.map((x) => x.nome)} />
          <S k="cat" ph="Categorias" opts={data.categories.map((x) => x.nome)} />
          <S k="gasto" ph="Tipo de gasto" opts={["Fixo", "Variável"]} />
          <S k="renda" ph="Tipo de renda" opts={["Fixa", "Variável"]} />
          <S k="pag" ph="Pagamentos" opts={data.methods.map((x) => x.nome)} />
          <S k="status" ph="Todos status" opts={["Pago", "Pendente", "Atrasado"]} />
          <S k="parc" ph="Parcelado?" opts={["sim", "nao"]} />
        </div>
      </div>

      <div className="space-y-2">
        {list.length === 0 && <div className="panel p-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</div>}
        {list.map((t) => {
          const mov = t.tipo_movimentacao as Mov;
          const multi = t.installments.length > 1;
          const pagas = t.installments.filter((i) => i.pago).length;
          const single = t.installments[0];
          const sts = single ? statusOf(single, mov) : "Pendente";
          return (
            <div key={t.id} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <span className={`h-9 w-1 rounded-full ${mov === "Renda" ? "bg-income" : "bg-expense"}`} />
                <div className="min-w-40 flex-1">
                  <div className="font-semibold">{txLabel(t)}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(txDate(t))} · {t.responsavel} · {mov === "Renda" ? `Renda ${t.tipo_renda ?? ""}` : `${t.categoria} · ${t.tipo_pagamento}`}</div>
                </div>
                <div className="text-right">
                  <div className={`font-display font-bold ${mov === "Renda" ? "text-income" : "text-expense"}`}>{brl(Number(t.valor_total))}</div>
                  {multi && <div className="text-xs text-muted-foreground">{t.numero_parcelas}x de {brl(Number(single?.valor_parcela ?? 0))} · {pagas}/{t.numero_parcelas} pagas</div>}
                  {!multi && single && mov === "Custo" && <div className="text-xs text-muted-foreground">vence {fmtDate(single.data_vencimento)}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {!multi && single && mov === "Custo" && (
                    <button onClick={() => setPay({ inst: single, tx: t })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[sts]}`}>{sts === "Pago" ? "✓ Pago" : `${sts} · pagar`}</button>
                  )}
                  {multi && <button onClick={() => setOpen({ ...open, [t.id]: !open[t.id] })} className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold">Parcelas <ChevronDown className={`h-3.5 w-3.5 transition ${open[t.id] ? "rotate-180" : ""}`} /></button>}
                  <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => openLancamento(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Copiar para o próximo mês" onClick={() => duplicate(t)}><Copy className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {multi && open[t.id] && (
                <div className="divide-y divide-border border-t border-border bg-muted/40">
                  {t.installments.map((i) => {
                    const s = statusOf(i, mov);
                    return (
                      <button key={i.id} onClick={() => setPay({ inst: i, tx: t })} className="flex w-full flex-wrap items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent/50">
                        <StatusIcon s={s} />
                        <span className="w-14 font-semibold">{i.numero_parcela}/{i.total_parcelas}</span>
                        <span className="flex-1 text-muted-foreground">vence {fmtDate(i.data_vencimento)} · {i.quinzena}{i.pago && i.data_pagamento ? ` · pago em ${fmtDate(i.data_pagamento)}` : ""}</span>
                        <span className="font-semibold">{brl(Number(i.valor_parcela))}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[s]}`}>{s}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <PayDialog target={pay} onClose={() => setPay(null)} />
    </div>
  );
}
