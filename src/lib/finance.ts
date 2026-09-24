import { useSyncExternalStore } from "react";

export type Mov = "Custo" | "Renda";
export interface Card { id: string; nome: string; fechamento: number; vencimento: number }
export interface Lancamento {
  id: string;
  mov: Mov;
  responsavel: string;
  data: string; // yyyy-mm-dd
  descricao: string;
  categoria: string;
  tipo: "Fixa" | "Variável";
  valor: number; // valor total
  pagamento: string;
  parcelas: number;
  pagas: number[]; // nº de parcelas pagas
  anexo?: string;
}
export interface Config {
  cartoes: Card[];
  categorias: string[];
  responsaveis: string[];
  pagamentos: string[]; // outros meios (não cartão)
  metaGasto: number;
}
interface State { lancamentos: Lancamento[]; config: Config }

const KEY = "financas-v1";
const uid = () => Math.random().toString(36).slice(2, 10);

const seed: State = {
  config: {
    cartoes: [
      { id: "c1", nome: "Assai", fechamento: 14, vencimento: 20 },
      { id: "c2", nome: "Shoppe parcelado", fechamento: 14, vencimento: 25 },
      { id: "c3", nome: "itau", fechamento: 4, vencimento: 10 },
    ],
    categorias: ["Alimentação", "Assinaturas", "Cosmetico (perfumaria)", "Emprestimo", "Lazer(bares e festas)", "Moto", "Transporte"],
    responsaveis: ["Nicoli", "Natasha"],
    pagamentos: ["Debito/Pix/Dinheiro", "Limite"],
    metaGasto: 3000,
  },
  lancamentos: [
    ["Custo", "Nicoli", "2026-09-18", "", "Cosmetico (perfumaria)", "Variável", 250, "Assai", 2],
    ["Renda", "Nicoli", "2026-09-18", "Vale", "", "Fixa", 1000, "", 1],
    ["Custo", "Nicoli", "2026-09-18", "gasolina", "Transporte", "Variável", 100, "Assai", 1],
    ["Custo", "Natasha", "2026-09-13", "arroz", "Alimentação", "Variável", 50, "itau", 1],
    ["Custo", "Nicoli", "2026-09-14", "gin", "Lazer(bares e festas)", "Variável", 40, "Debito/Pix/Dinheiro", 1],
    ["Custo", "Natasha", "2026-09-03", "pgar itau", "Emprestimo", "Variável", 1200, "Limite", 1],
    ["Custo", "Natasha", "2026-09-06", "peça", "Moto", "Variável", 1500, "itau", 5],
    ["Renda", "Nicoli", "2026-09-05", "Salário", "", "Fixa", 1000, "", 1],
    ["Renda", "Nicoli", "2026-09-05", "Salário", "", "Fixa", 1000, "", 1],
    ["Renda", "Natasha", "2026-09-20", "99", "", "Variável", 90, "", 1],
    ["Custo", "Nicoli", "2026-09-14", "net", "Assinaturas", "Variável", 60, "Assai", 1],
    ["Custo", "Nicoli", "2026-09-15", "gas", "Moto", "Variável", 20, "Assai", 1],
    ["Custo", "Nicoli", "2026-09-14", "perfume", "Cosmetico (perfumaria)", "Variável", 100, "Assai", 1],
    ["Custo", "Nicoli", "2026-09-14", "streaming", "Assinaturas", "Variável", 157, "Assai", 1],
  ].map(([mov, responsavel, data, descricao, categoria, tipo, valor, pagamento, parcelas]) => ({
    id: uid(), mov, responsavel, data, descricao, categoria, tipo, valor, pagamento, parcelas, pagas: [],
  })) as Lancamento[],
};

let state: State = seed;
let loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch { /* ignore */ }
}
function set(next: State) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}
export function useFinance() {
  const s = useSyncExternalStore(
    (l) => { load(); listeners.add(l); l(); return () => listeners.delete(l); },
    () => { load(); return state; },
    () => seed,
  );
  return s;
}
export const actions = {
  save(l: Omit<Lancamento, "id" | "pagas"> & { id?: string; pagas?: number[] }) {
    const exists = l.id && state.lancamentos.some((x) => x.id === l.id);
    const item = { ...l, id: l.id || uid(), pagas: l.pagas ?? [] } as Lancamento;
    set({ ...state, lancamentos: exists ? state.lancamentos.map((x) => (x.id === l.id ? item : x)) : [item, ...state.lancamentos] });
  },
  remove(id: string) { set({ ...state, lancamentos: state.lancamentos.filter((x) => x.id !== id) }); },
  duplicate(id: string) {
    const o = state.lancamentos.find((x) => x.id === id); if (!o) return;
    const d = new Date(o.data + "T00:00"); d.setMonth(d.getMonth() + 1);
    set({ ...state, lancamentos: [{ ...o, id: uid(), pagas: [], data: d.toISOString().slice(0, 10) }, ...state.lancamentos] });
  },
  togglePaga(id: string, n: number) {
    set({ ...state, lancamentos: state.lancamentos.map((x) => x.id !== id ? x : { ...x, pagas: x.pagas.includes(n) ? x.pagas.filter((p) => p !== n) : [...x.pagas, n] }) });
  },
  setConfig(config: Config) { set({ ...state, config }); },
  reset() { set(seed); },
};

export type Status = "Pago" | "No Prazo" | "Atrasado";
export interface Parcela {
  key: string; lanc: Lancamento; n: number; label: string; valor: number;
  vencimento: Date; mesRef: string; status: Status; quinzena: string;
}

/** Mesma lógica da aba FINANCEIRO: divide em parcelas e calcula vencimento pelo fechamento do cartão. */
export function parcelas(list: Lancamento[], cfg: Config, hoje = new Date()): Parcela[] {
  const out: Parcela[] = [];
  const today = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  for (const l of list) {
    const d = new Date(l.data + "T00:00");
    const card = cfg.cartoes.find((c) => c.nome === l.pagamento);
    for (let n = 1; n <= Math.max(1, l.parcelas); n++) {
      let venc: Date;
      if (card && l.mov === "Custo") {
        const offset = d.getDate() > card.fechamento ? 1 : 0;
        venc = new Date(d.getFullYear(), d.getMonth() + offset + (n - 1), card.vencimento);
      } else {
        venc = new Date(d.getFullYear(), d.getMonth() + (n - 1), d.getDate());
      }
      const pago = l.pagas.includes(n) || l.mov === "Renda" && venc <= today && false;
      const status: Status = l.pagas.includes(n) ? "Pago" : venc < today ? "Atrasado" : "No Prazo";
      out.push({
        key: `${l.id}-${n}`, lanc: l, n, label: `${n}/${l.parcelas}`, valor: l.valor / Math.max(1, l.parcelas),
        vencimento: venc, mesRef: `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, "0")}`,
        status: pago ? "Pago" : status, quinzena: card ? `Dia ${card.vencimento}` : venc.getDate() <= 15 ? "Dia 10" : "Dia 20",
      });
    }
  }
  return out.sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtDate = (d: Date | string) => (typeof d === "string" ? new Date(d + "T00:00") : d).toLocaleDateString("pt-BR");
export const mesLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y ?? 0, (mo ?? 1) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }); };

export function groupSum<T>(items: T[], key: (i: T) => string, val: (i: T) => number) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + val(i)));
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function toCSV(rows: Parcela[]) {
  const h = ["Data", "Movimentação", "Responsável", "Descrição", "Categoria", "Tipo", "Valor Parcela", "Pagamento", "Parcela", "Vencimento", "Status"];
  const lines = rows.map((p) => [p.lanc.data, p.lanc.mov, p.lanc.responsavel, p.lanc.descricao, p.lanc.categoria, p.lanc.tipo, p.valor.toFixed(2).replace(".", ","), p.lanc.pagamento, p.label, fmtDate(p.vencimento), p.status].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
  return "\uFEFF" + [h.join(";"), ...lines].join("\n");
}
