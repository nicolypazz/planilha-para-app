import { useSyncExternalStore } from "react";
import type { Tx } from "./data";

let state: { open: boolean; edit: Tx | null } = { open: false, edit: null };
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
export const openLancamento = (edit: Tx | null = null) => { state = { open: true, edit }; emit(); };
export const closeLancamento = () => { state = { ...state, open: false }; emit(); };
export function useLancamentoUI() {
  return useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, () => state, () => state);
}
