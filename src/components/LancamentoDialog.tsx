import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actions, useFinance, type Lancamento, type Mov } from "@/lib/finance";

type Draft = Omit<Lancamento, "id" | "pagas"> & { id?: string; pagas?: number[] };
const empty = (): Draft => ({ mov: "Custo", responsavel: "", data: new Date().toISOString().slice(0, 10), descricao: "", categoria: "", tipo: "Variável", valor: 0, pagamento: "", parcelas: 1 });

export function LancamentoDialog({ open, onOpenChange, edit }: { open: boolean; onOpenChange: (o: boolean) => void; edit?: Lancamento | null }) {
  const { config } = useFinance();
  const [f, setF] = useState<Draft>(empty());
  useEffect(() => { if (open) setF(edit ? { ...edit } : empty()); }, [open, edit]);
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((p) => ({ ...p, [k]: v }));
  const custo = f.mov === "Custo";
  const pagamentos = [...config.cartoes.map((c) => c.nome), ...config.pagamentos];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.responsavel || !f.data || !(f.valor > 0)) { toast.error("Preencha responsável, data e valor."); return; }
    if (custo && (!f.categoria || !f.pagamento)) { toast.error("Informe categoria e tipo de pagamento."); return; }
    if (!custo && !f.descricao) { toast.error("Informe a descrição da renda."); return; }
    actions.save({ ...f, parcelas: custo ? Math.max(1, f.parcelas) : 1, categoria: custo ? f.categoria : "", pagamento: custo ? f.pagamento : "" });
    toast.success(edit ? "Lançamento atualizado" : "Lançamento salvo");
    onOpenChange(false);
  }

  function onFile(file?: File) {
    if (!file) return;
    if (file.size > 1_500_000) { toast.error("Arquivo muito grande (máx. 1,5 MB)."); return; }
    const r = new FileReader(); r.onload = () => up("anexo", r.result as string); r.readAsDataURL(file);
  }

  const Sel = ({ v, on, opts, ph }: { v: string; on: (s: string) => void; opts: string[]; ph: string }) => (
    <Select {...(v ? { value: v } : {})} onValueChange={on}>
      <SelectTrigger><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display">{edit ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            {(["Custo", "Renda"] as Mov[]).map((m) => (
              <button type="button" key={m} onClick={() => up("mov", m)}
                className={`rounded-md py-2 text-sm font-semibold ${f.mov === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{m}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Responsável *</Label><Sel v={f.responsavel} on={(s) => up("responsavel", s)} opts={config.responsaveis} ph="Quem?" /></div>
            <div className="grid gap-1.5"><Label>{custo ? "Data da compra *" : "Data do recebimento *"}</Label><Input type="date" value={f.data} onChange={(e) => up("data", e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>{custo ? "Descrição da compra" : "Descrição da renda *"}</Label><Input value={f.descricao} onChange={(e) => up("descricao", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>{custo ? "Valor total *" : "Valor da renda *"}</Label><Input type="number" step="0.01" min="0" value={f.valor || ""} onChange={(e) => up("valor", parseFloat(e.target.value) || 0)} /></div>
            <div className="grid gap-1.5"><Label>{custo ? "Tipo de gasto" : "Tipo de renda"}</Label><Sel v={f.tipo} on={(s) => up("tipo", s as Draft["tipo"])} opts={["Fixa", "Variável"]} ph="Tipo" /></div>
          </div>
          {custo && (
            <>
              <div className="grid gap-1.5"><Label>Categoria do gasto *</Label><Sel v={f.categoria} on={(s) => up("categoria", s)} opts={config.categorias} ph="Categoria" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Tipo de pagamento *</Label><Sel v={f.pagamento} on={(s) => up("pagamento", s)} opts={pagamentos} ph="Pagamento" /></div>
                <div className="grid gap-1.5"><Label>Nº de parcelas</Label><Input type="number" min="1" max="48" value={f.parcelas} onChange={(e) => up("parcelas", parseInt(e.target.value) || 1)} /></div>
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label>Comprovante (imagem ou PDF)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} />
            {f.anexo && <button type="button" className="text-left text-xs text-muted-foreground underline" onClick={() => setF(({ anexo: _a, ...rest }) => rest)}>Remover anexo</button>}
          </div>
          <Button type="submit" size="lg">Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
