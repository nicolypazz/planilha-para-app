import { useSyncExternalStore } from "react";
import type { Tx } from "./data";

export type LancamentoDefaults = {
  tipo_movimentacao?: "Renda" | "Custo";
  tipo_pagamento?: string | null;
  data_compra?: string | null;
};

let state: { open: boolean; edit: Tx | null; defaults: LancamentoDefaults | null } = { open: false, edit: null, defaults: null };
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

export const openLancamento = (edit: Tx | null = null) => { state = { open: true, edit, defaults: null }; emit(); };
export const openLancamentoComDefaults = (defaults: LancamentoDefaults) => { state = { open: true, edit: null, defaults }; emit(); };
export const closeLancamento = () => { state = { ...state, open: false, defaults: null }; emit(); };

export function useLancamentoUI() {
  return useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, () => state, () => state);
}
