import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { brl, fmtDate, setInvoicePaid, useFin, useRefresh, type Inst, type Tx } from "@/lib/data";
import { statusOf, todayIso } from "@/lib/engine";
import { openLancamentoComDefaults } from "@/lib/ui";

export const Route = createFileRoute("/_authenticated/faturas")({
  head: () => ({ meta: [{ title: "Faturas — Controle de Financeiro" }, { name: "description", content: "Compras agrupadas por cartão e vencimento." }] }),
  component: Page,
});

type Invoice = {
  method: string;
  dueDate: string;
  insts: { inst: Inst; tx: Tx }[];
};

function Page() {
  const { data } = useFin();
  const refresh = useRefresh();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const invoices = useMemo<Invoice[]>(() => {
    if (!data) return [];
    const map = new Map<string, Invoice>();
    for (const tx of data.txs) {
      if (tx.tipo_movimentacao !== "Custo" || !tx.tipo_pagamento) continue;
      const method = data.methods.find((m) => m.nome === tx.tipo_pagamento);
      if (!method?.utiliza_fechamento) continue;
      for (const inst of tx.installments) {
        const key = `${tx.tipo_pagamento}|${inst.data_vencimento}`;
        const cur = map.get(key) ?? { method: tx.tipo_pagamento, dueDate: inst.data_vencimento, insts: [] };
        cur.insts.push({ inst, tx });
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.method.localeCompare(b.method));
  }, [data]);

  if (!data) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  async function togglePaid(inv: Invoice) {
    const key = `${inv.method}|${inv.dueDate}`;
    const paid = inv.insts.every(({ inst }) => inst.pago);
    setSaving(key);
    try {
      await setInvoicePaid(inv.method, inv.dueDate, !paid, !paid ? todayIso() : null, data?.txs ?? []);
      await refresh();
      toast.success(paid ? "Pagamento da fatura desfeito" : "Fatura marcada como paga");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(null); }
  }

  const openInvoices = invoices.filter((inv) => !inv.insts.every(({ inst }) => inst.pago));
  const paidInvoices = invoices.filter((inv) => inv.insts.every(({ inst }) => inst.pago));

  const renderInvoice = (inv: Invoice) => {
    const key = `${inv.method}|${inv.dueDate}`;
    const paid = inv.insts.every(({ inst }) => inst.pago);
    const total = inv.insts.reduce((s, { inst }) => s + Number(inst.valor_parcela), 0);
    const isOpen = open[key] ?? false;
    const uniqueTx = new Set(inv.insts.map(({ tx }) => tx.id)).size;
    return (
      <section key={key} className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><CreditCard className="h-5 w-5 text-primary" /></div>
          <div className="min-w-48 flex-1"><div className="font-display font-semibold">{inv.method}</div><div className="text-sm text-muted-foreground">Vencimento {fmtDate(inv.dueDate)} · {uniqueTx} {uniqueTx === 1 ? "compra" : "compras"}</div></div>
          <div className="text-right"><div className="font-display text-xl font-bold">{brl(total)}</div><div className={`text-xs font-semibold ${paid ? "text-paid" : "text-pending"}`}>{paid ? "✓ Fatura paga" : "● Fatura em aberto"}</div></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openLancamentoComDefaults({ tipo_movimentacao: "Custo", tipo_pagamento: inv.method, data_compra: inv.dueDate, primeiro_vencimento: inv.dueDate })}><Plus className="mr-1 h-4 w-4" /> Novo lançamento</Button>
            <Button size="sm" disabled={saving === key} onClick={() => togglePaid(inv)}>{saving === key ? "Salvando…" : paid ? "Desfazer pagamento" : "Pagar fatura"}</Button>
            <Button variant="ghost" size="icon" aria-label="Expandir" onClick={() => setOpen({ ...open, [key]: !isOpen })}><ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} /></Button>
          </div>
        </div>
        {isOpen && <div className="divide-y divide-border border-t border-border bg-muted/30">
          {inv.insts.map(({ inst, tx }) => {
            const s = statusOf(inst, "Custo");
            return <div key={inst.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {s === "Pago" ? <CheckCircle2 className="h-4 w-4 text-paid" /> : <Circle className="h-4 w-4 text-pending" />}
              <div className="min-w-40 flex-1"><div className="font-medium">{tx.descricao || tx.categoria || "Compra"}</div><div className="text-xs text-muted-foreground">{fmtDate(tx.data_compra)} · {tx.responsavel}{inst.total_parcelas > 1 ? ` · ${inst.numero_parcela}/${inst.total_parcelas}` : ""}</div></div>
              <div className="text-right"><div className="font-semibold">{brl(Number(inst.valor_parcela))}</div><div className="text-xs text-muted-foreground">{s === "Pago" && inst.data_pagamento ? `pago em ${fmtDate(inst.data_pagamento)}` : s}</div></div>
            </div>;
          })}
        </div>}
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div><h1 className="font-display text-3xl font-bold">Faturas</h1><p className="text-sm text-muted-foreground">Confira as compras de cada cartão, inclua o que estiver faltando e pague a fatura inteira de uma vez.</p></div>
      {invoices.length === 0 && <div className="panel p-8 text-center text-muted-foreground">Nenhuma compra de cartão encontrada.</div>}
      {openInvoices.length > 0 && <div className="space-y-3">{openInvoices.map(renderInvoice)}</div>}
      {paidInvoices.length > 0 && (
        <section className="panel overflow-hidden">
          <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen({ ...open, __paid_group__: !(open.__paid_group__ ?? false) })}>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-paid/10"><CheckCircle2 className="h-5 w-5 text-paid" /></div>
            <div className="flex-1"><div className="font-display font-semibold">Faturas pagas</div><div className="text-sm text-muted-foreground">{paidInvoices.length} {paidInvoices.length === 1 ? "fatura paga" : "faturas pagas"}</div></div>
            <ChevronDown className={`h-5 w-5 transition ${open.__paid_group__ ? "rotate-180" : ""}`} />
          </button>
          {open.__paid_group__ && <div className="space-y-3 border-t border-border bg-muted/20 p-3">{paidInvoices.map(renderInvoice)}</div>}
        </section>
      )}
    </div>
  );
}
