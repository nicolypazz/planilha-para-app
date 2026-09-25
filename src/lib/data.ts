import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { computeInstallments, mergePaid, statusOf, todayIso, type Mov, type Status } from "./engine";

export type Method = Tables<"payment_methods">;
export type Named = { id: string; nome: string; ativo: boolean };
export type Inst = Tables<"installments">;
export type Tx = Tables<"transactions"> & { installments: Inst[] };
export interface Row { inst: Inst; tx: Tx; status: Status; valor: number; mov: Mov }

export interface FinData {
  methods: Method[]; categories: Named[]; responsaveis: Named[]; sources: Named[]; txs: Tx[]; rows: Row[];
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

async function fetchAll(): Promise<FinData> {
  const [m, c, r, s, t] = await Promise.all([
    supabase.from("payment_methods").select("*").order("created_at"),
    supabase.from("categories").select("id,nome,ativo").order("nome"),
    supabase.from("responsible_users").select("id,nome,ativo").order("created_at"),
    supabase.from("income_sources").select("id,nome,ativo").order("nome"),
    supabase.from("transactions").select("*, installments(*)").order("created_at", { ascending: false }).limit(5000),
  ]);
  const txs = (ok(t) as Tx[]).map((x) => ({ ...x, valor_total: Number(x.valor_total), installments: [...x.installments].sort((a, b) => a.numero_parcela - b.numero_parcela) }));
  const today = todayIso();
  const rows: Row[] = [];
  for (const tx of txs) for (const inst of tx.installments) {
    const mov = tx.tipo_movimentacao as Mov;
    rows.push({ inst, tx, mov, valor: Number(inst.valor_parcela), status: statusOf(inst, mov, today) });
  }
  return { methods: ok(m), categories: ok(c), responsaveis: ok(r), sources: ok(s), txs, rows };
}

export const finKey = ["fin"] as const;
export function useFin() { return useQuery({ queryKey: finKey, queryFn: fetchAll }); }
export function useRefresh() { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: finKey }); }

// ---------- Escritas ----------
export interface TxDraft {
  id?: string;
  tipo_movimentacao: Mov;
  responsavel: string;
  data_compra: string | null;
  data_recebimento: string | null;
  descricao: string;
  categoria: string | null;
  tipo_gasto: string | null;
  tipo_renda: string | null;
  valor_total: number;
  tipo_pagamento: string | null;
  numero_parcelas: number;
}
/** Para importação histórica: quantas parcelas já foram pagas e quando. */
export interface PaidInfo { parcelasPagas: number; dataPagamento: string | null }

const findMethod = (methods: Method[], nome: string | null) => methods.find((m) => m.nome === nome) ?? null;

function buildInstallments(txId: string, d: TxDraft, methods: Method[], old: Inst[], paid?: PaidInfo) {
  const calc = computeInstallments(d, findMethod(methods, d.tipo_pagamento));
  let merged = mergePaid(calc, old);
  if (paid && paid.parcelasPagas > 0) merged = merged.map((i) => i.numero_parcela <= paid.parcelasPagas
    ? { ...i, pago: true, data_pagamento: paid.dataPagamento ?? i.data_vencimento } : i);
  return merged.map((i) => ({ ...i, transaction_id: txId, status: statusOf(i, d.tipo_movimentacao) }));
}

function txRow(d: TxDraft) {
  const n = d.tipo_movimentacao === "Renda" ? 1 : Math.max(1, d.numero_parcelas);
  return {
    tipo_movimentacao: d.tipo_movimentacao, responsavel: d.responsavel, data_compra: d.data_compra, data_recebimento: d.data_recebimento,
    descricao: d.descricao.trim(), categoria: d.categoria, tipo_gasto: d.tipo_gasto, tipo_renda: d.tipo_renda,
    valor_total: d.valor_total, tipo_pagamento: d.tipo_pagamento, numero_parcelas: n, parcelado: n > 1,
  };
}

async function syncTxPaid(txId: string, insts: { pago: boolean; data_pagamento: string | null }[]) {
  const all = insts.length > 0 && insts.every((i) => i.pago);
  const last = insts.map((i) => i.data_pagamento).filter(Boolean).sort().pop() ?? null;
  ok(await supabase.from("transactions").update({ pago: all, data_pagamento: all ? last : null }).eq("id", txId));
}

export async function saveTransaction(d: TxDraft, methods: Method[], existing?: Tx | null) {
  let id = d.id;
  if (id) ok(await supabase.from("transactions").update(txRow(d)).eq("id", id));
  else id = (ok(await supabase.from("transactions").insert(txRow(d)).select("id").single()) as { id: string }).id;
  const insts = buildInstallments(id, d, methods, existing?.installments ?? []);
  ok(await supabase.from("installments").delete().eq("transaction_id", id));
  ok(await supabase.from("installments").insert(insts));
  await syncTxPaid(id, insts);
}

export async function setPaid(inst: Inst, pago: boolean, data: string | null, tx: Tx) {
  ok(await supabase.from("installments").update({ pago, data_pagamento: pago ? data : null, status: pago ? "Pago" : statusOf({ ...inst, pago: false }, "Custo") }).eq("id", inst.id));
  await syncTxPaid(tx.id, tx.installments.map((i) => i.id === inst.id ? { pago, data_pagamento: pago ? data : null } : i));
}

export async function setInvoicePaid(methodName: string, dueDate: string, pago: boolean, dataPagamento: string | null, txs: Tx[]) {
  const targets = txs.flatMap((tx) =>
    tx.tipo_movimentacao === "Custo" && tx.tipo_pagamento === methodName
      ? tx.installments.filter((i) => i.data_vencimento === dueDate).map((i) => ({ tx, inst: i }))
      : []
  );
  for (const { inst } of targets) {
    ok(await supabase.from("installments").update({
      pago,
      data_pagamento: pago ? dataPagamento : null,
      status: statusOf({ ...inst, pago }, "Custo"),
    }).eq("id", inst.id));
  }
  const affected = new Set(targets.map((x) => x.tx.id));
  for (const id of affected) {
    const tx = txs.find((t) => t.id === id);
    if (tx) {
      const next = tx.installments.map((i) => targets.some((x) => x.inst.id === i.id)
        ? { ...i, pago, data_pagamento: pago ? dataPagamento : null }
        : i);
      await syncTxPaid(id, next);
    }
  }
}

export async function deleteTransaction(id: string) { ok(await supabase.from("transactions").delete().eq("id", id)); }

/** Ao mudar fechamento/vencimento de uma forma de pagamento, recalcula as parcelas das compras dela. */
export async function recalcMethod(nome: string, methods: Method[], txs: Tx[]) {
  for (const tx of txs.filter((t) => t.tipo_movimentacao === "Custo" && t.tipo_pagamento === nome)) {
    const d = { ...tx, tipo_movimentacao: "Custo" as Mov, valor_total: Number(tx.valor_total) };
    const insts = buildInstallments(tx.id, d, methods, tx.installments);
    ok(await supabase.from("installments").delete().eq("transaction_id", tx.id));
    ok(await supabase.from("installments").insert(insts));
  }
}

export async function bulkInsert(items: { draft: TxDraft; paid?: PaidInfo }[], methods: Method[]) {
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const ids = ok(await supabase.from("transactions").insert(chunk.map((c) => txRow(c.draft))).select("id")) as { id: string }[];
    const insts = chunk.flatMap((c, k) => buildInstallments(ids[k]!.id, c.draft, methods, [], c.paid));
    ok(await supabase.from("installments").insert(insts));
    for (const [k, c] of chunk.entries()) if (c.paid?.parcelasPagas) {
      await syncTxPaid(ids[k]!.id, insts.filter((x) => x.transaction_id === ids[k]!.id));
    }
  }
}

export const dupKey = (d: { tipo_movimentacao: string; data_compra: string | null; data_recebimento: string | null; valor_total: number; responsavel: string; descricao: string }) =>
  [d.tipo_movimentacao, d.data_compra ?? d.data_recebimento, Number(d.valor_total).toFixed(2), d.responsavel.toLowerCase(), d.descricao.trim().toLowerCase()].join("|");

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtDate = (s: string | null | undefined) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const MESES = MES;
export const mesLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MES[Number(m) - 1]}/${y?.slice(2)}`; };
export const txDate = (t: Tx) => t.data_compra ?? t.data_recebimento ?? t.data_lancamento;
export const txLabel = (t: Tx) => t.descricao || t.categoria || t.tipo_renda || "—";
