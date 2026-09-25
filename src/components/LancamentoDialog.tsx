import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownCircle, Coins } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, fmtDate, saveTransaction, useFin, useRefresh, type TxDraft } from "@/lib/data";
import { computeInstallments, todayIso, type Mov } from "@/lib/engine";
import { closeLancamento, useLancamentoUI } from "@/lib/ui";

const blank = (mov: Mov): TxDraft => ({
  tipo_movimentacao: mov, responsavel: "", data_compra: mov === "Custo" ? todayIso() : null, data_recebimento: mov === "Renda" ? todayIso() : null,
  descricao: "", categoria: null, tipo_gasto: mov === "Custo" ? "Variável" : null, tipo_renda: mov === "Renda" ? "Variável" : null,
  valor_total: 0, tipo_pagamento: null, numero_parcelas: 1,
});

function Sel({ v, on, opts, ph }: { v: string | null; on: (s: string) => void; opts: string[]; ph: string }) {
  return (
    <Select {...(v ? { value: v } : { value: "" })} onValueChange={on}>
      <SelectTrigger><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function LancamentoDialog() {
  const { open, edit, defaults } = useLancamentoUI();
  const { data } = useFin();
  const refresh = useRefresh();
  const [f, setF] = useState<TxDraft | null>(null);
  const [parcelado, setParcelado] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setF({ ...edit, tipo_movimentacao: edit.tipo_movimentacao as Mov, valor_total: Number(edit.valor_total), descricao: edit.descricao ?? "" });
      setParcelado(edit.numero_parcelas > 1);
    } else if (defaults) { setF({ ...blank(defaults.tipo_movimentacao ?? "Custo"), ...defaults }); setParcelado(false); }\n    else { setF(null); setParcelado(false); }
  }, [open, edit]);

  const up = <K extends keyof TxDraft>(k: K, v: TxDraft[K]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const methods = data?.methods ?? [];
  const ativos = (xs: { nome: string; ativo: boolean }[] = [], cur?: string | null) => xs.filter((x) => x.ativo || x.nome === cur).map((x) => x.nome);

  const preview = useMemo(() => {
    if (!f || !(f.valor_total > 0)) return [];
    try {
      return computeInstallments({ ...f, numero_parcelas: parcelado ? f.numero_parcelas : 1 }, methods.find((m) => m.nome === f.tipo_pagamento));
    } catch { return []; }
  }, [f, parcelado, methods]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    const custo = f.tipo_movimentacao === "Custo";
    if (!f.responsavel) return toast.error("Informe o responsável.");
    if (!(f.valor_total > 0)) return toast.error("Informe um valor maior que zero.");
    if (custo && (!f.data_compra || !f.categoria || !f.tipo_pagamento)) return toast.error("Informe data da compra, categoria e forma de pagamento.");
    if (!custo && (!f.data_recebimento || !f.descricao.trim())) return toast.error("Informe data do recebimento e descrição da renda.");
    const n = custo && parcelado ? Math.min(120, Math.max(2, f.numero_parcelas)) : 1;
    setSaving(true);
    try {
      await saveTransaction({ ...f, numero_parcelas: n }, methods, edit);
      await refresh();
      toast.success(edit ? "Lançamento atualizado" : "Lançamento salvo");
      closeLancamento();
    } catch (err) { toast.error(`Não foi possível salvar: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeLancamento()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display">{edit ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
        {!f ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Qual tipo de lançamento?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setF(blank("Renda"))} className="panel flex flex-col items-center gap-2 p-6 hover:border-income">
                <Coins className="h-8 w-8 text-income" /><span className="font-display font-semibold">Renda</span></button>
              <button onClick={() => setF(blank("Custo"))} className="panel flex flex-col items-center gap-2 p-6 hover:border-expense">
                <ArrowDownCircle className="h-8 w-8 text-expense" /><span className="font-display font-semibold">Custo</span></button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className={`rounded-lg px-3 py-1.5 text-center text-sm font-semibold ${f.tipo_movimentacao === "Renda" ? "bg-income/15 text-income" : "bg-expense/15 text-expense"}`}>{f.tipo_movimentacao}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Responsável *</Label><Sel v={f.responsavel || null} on={(s) => up("responsavel", s)} opts={ativos(data?.responsaveis, f.responsavel)} ph="Quem?" /></div>
              {f.tipo_movimentacao === "Renda"
                ? <div className="grid gap-1.5"><Label>Data do recebimento *</Label><Input type="date" value={f.data_recebimento ?? ""} onChange={(e) => up("data_recebimento", e.target.value)} /></div>
                : <div className="grid gap-1.5"><Label>Data da compra *</Label><Input type="date" value={f.data_compra ?? ""} onChange={(e) => up("data_compra", e.target.value)} /></div>}
            </div>
            {f.tipo_movimentacao === "Renda" ? (
              <>
                <div className="grid gap-1.5"><Label>Descrição da renda *</Label>
                  <Input list="fontes" value={f.descricao} onChange={(e) => up("descricao", e.target.value)} placeholder="Salário, iFood, Uber…" />
                  <datalist id="fontes">{ativos(data?.sources).map((s) => <option key={s} value={s} />)}</datalist></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Tipo de renda</Label><Sel v={f.tipo_renda} on={(s) => up("tipo_renda", s)} opts={["Fixa", "Variável"]} ph="Tipo" /></div>
                  <div className="grid gap-1.5"><Label>Valor *</Label><Input type="number" inputMode="decimal" step="0.01" min="0" value={f.valor_total || ""} onChange={(e) => up("valor_total", parseFloat(e.target.value) || 0)} /></div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Categoria *</Label><Sel v={f.categoria} on={(s) => up("categoria", s)} opts={ativos(data?.categories, f.categoria)} ph="Categoria" /></div>
                  <div className="grid gap-1.5"><Label>Tipo de gasto</Label><Sel v={f.tipo_gasto} on={(s) => up("tipo_gasto", s)} opts={["Fixo", "Variável"]} ph="Tipo" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Valor total *</Label><Input type="number" inputMode="decimal" step="0.01" min="0" value={f.valor_total || ""} onChange={(e) => up("valor_total", parseFloat(e.target.value) || 0)} /></div>
                  <div className="grid gap-1.5"><Label>Forma de pagamento *</Label><Sel v={f.tipo_pagamento} on={(s) => up("tipo_pagamento", s)} opts={ativos(methods, f.tipo_pagamento)} ph="Pagamento" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Parcelado?</Label><Sel v={parcelado ? "Sim" : "Não"} on={(s) => { setParcelado(s === "Sim"); if (s === "Sim" && f.numero_parcelas < 2) up("numero_parcelas", 2); }} opts={["Não", "Sim"]} ph="" /></div>
                  {parcelado && <div className="grid gap-1.5"><Label>Nº de parcelas</Label><Input type="number" min="2" max="120" value={f.numero_parcelas} onChange={(e) => up("numero_parcelas", parseInt(e.target.value) || 2)} /></div>}
                </div>
                <div className="grid gap-1.5"><Label>Descrição</Label><Input value={f.descricao} onChange={(e) => up("descricao", e.target.value)} placeholder="Ex.: mercado, gasolina" /></div>
              </>
            )}
            {preview.length > 0 && f.tipo_movimentacao === "Custo" && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs">
                <div className="mb-1.5 font-semibold text-highlight">Calculado automaticamente</div>
                <div className="grid max-h-36 gap-1 overflow-y-auto">
                  {preview.map((p) => <div key={p.numero_parcela} className="flex justify-between"><span>{p.numero_parcela}/{p.total_parcelas} · vence {fmtDate(p.data_vencimento)} · {p.quinzena}</span><span className="font-semibold">{brl(p.valor_parcela)}</span></div>)}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {!edit && <Button type="button" variant="secondary" onClick={() => setF(null)}>Voltar</Button>}
              <Button type="submit" size="lg" className="flex-1" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
