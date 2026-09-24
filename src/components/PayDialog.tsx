import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl, fmtDate, setPaid, txLabel, useRefresh, type Inst, type Tx } from "@/lib/data";
import { todayIso } from "@/lib/engine";

/** Marcar/editar pagamento: sempre pede a data do pagamento (padrão = hoje). */
export function PayDialog({ target, onClose }: { target: { inst: Inst; tx: Tx } | null; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const refresh = useRefresh();
  useEffect(() => { if (target) setDate(target.inst.data_pagamento ?? todayIso()); }, [target]);
  if (!target) return null;
  const { inst, tx } = target;
  const run = async (pago: boolean) => {
    setBusy(true);
    try { await setPaid(inst, pago, date, tx); await refresh(); toast.success(pago ? "Pagamento registrado" : "Pagamento desfeito"); onClose(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Registrar pagamento</DialogTitle></DialogHeader>
        <div className="space-y-1 text-sm">
          <div className="font-semibold">{txLabel(tx)} {inst.total_parcelas > 1 && `· ${inst.numero_parcela}/${inst.total_parcelas}`}</div>
          <div className="text-muted-foreground">{brl(Number(inst.valor_parcela))} · vence {fmtDate(inst.data_vencimento)}</div>
        </div>
        <div className="grid gap-1.5"><Label>Data do pagamento</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex gap-2">
          {inst.pago && <Button variant="secondary" disabled={busy} onClick={() => run(false)}>Marcar como não pago</Button>}
          <Button className="flex-1" disabled={busy || !date} onClick={() => run(true)}>{inst.pago ? "Salvar data" : "Marcar como pago"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
