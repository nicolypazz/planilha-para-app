/**
 * Motor financeiro — regras da planilha (Power Query) em funções puras.
 * Nenhuma função aqui acessa o banco: recebem dados e devolvem cálculos.
 */
export type Mov = "Renda" | "Custo";
export type Status = "Pago" | "Pendente" | "Atrasado" | "Recebido";

export interface MethodRule {
  nome: string;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  utiliza_fechamento: boolean;
}
export interface TxCalcInput {
  tipo_movimentacao: Mov;
  data_compra?: string | null;
  data_recebimento?: string | null;
  valor_total: number;
  numero_parcelas: number;
}
export interface InstCalc {
  numero_parcela: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string; // yyyy-mm-dd
  mes_vencimento: string; // yyyy-mm
  quinzena: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const lastDay = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
export function ymd(y: number, m0: number, d: number) {
  const yy = y + Math.floor(m0 / 12);
  const mm = ((m0 % 12) + 12) % 12;
  return `${yy}-${pad(mm + 1)}-${pad(Math.min(d, lastDay(yy, mm)))}`;
}
export const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y: y ?? 1970, m0: (m ?? 1) - 1, d: d ?? 1 };
};
export const addMonths = (iso: string, k: number) => {
  const { y, m0, d } = parseIso(iso);
  return ymd(y, m0 + k, d);
};
export const quinzenaOf = (iso: string) => (parseIso(iso).d <= 15 ? "Dia 10" : "Dia 20");
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** Mês da fatura (primeira parcela) segundo o fechamento do cartão. */
export function firstDue(dataCompra: string, method?: MethodRule | null): string {
  if (method?.utiliza_fechamento && method.dia_fechamento && method.dia_vencimento) {
    const { y, m0, d } = parseIso(dataCompra);
    const offset = d > method.dia_fechamento ? 1 : 0;
    return ymd(y, m0 + offset, method.dia_vencimento);
  }
  return dataCompra;
}

/** Divide o valor total em parcelas (centavos que sobram vão na última) e calcula cada vencimento. */
export function computeInstallments(tx: TxCalcInput, method?: MethodRule | null): InstCalc[] {
  const mk = (n: number, total: number, valor: number, venc: string): InstCalc => ({
    numero_parcela: n, total_parcelas: total, valor_parcela: valor, data_vencimento: venc,
    mes_vencimento: venc.slice(0, 7), quinzena: quinzenaOf(venc),
  });
  if (tx.tipo_movimentacao === "Renda") {
    const d = tx.data_recebimento ?? tx.data_compra;
    if (!d) throw new Error("Data do recebimento obrigatória");
    return [mk(1, 1, round2(tx.valor_total), d)];
  }
  if (!tx.data_compra) throw new Error("Data da compra obrigatória");
  const n = Math.max(1, Math.floor(tx.numero_parcelas || 1));
  const cents = Math.round(tx.valor_total * 100);
  const base = Math.round(cents / n);
  const lastC = cents - base * (n - 1);
  const card = method?.utiliza_fechamento && method.dia_fechamento && method.dia_vencimento ? method : null;
  const out: InstCalc[] = [];
  for (let k = 1; k <= n; k++) {
    let venc: string;
    if (card) {
      const { y, m0, d } = parseIso(tx.data_compra);
      const offset = d > card.dia_fechamento! ? 1 : 0;
      venc = ymd(y, m0 + offset + k - 1, card.dia_vencimento!);
    } else venc = addMonths(tx.data_compra, k - 1);
    out.push(mk(k, n, (k === n ? lastC : base) / 100, venc));
  }
  return out;
}

export function statusOf(i: { pago: boolean; data_vencimento: string }, mov: Mov, today = todayIso()): Status {
  if (mov === "Renda") return "Recebido";
  if (i.pago) return "Pago";
  return i.data_vencimento < today ? "Atrasado" : "Pendente";
}

/** Recalcula parcelas preservando o que já foi marcado como pago. */
export function mergePaid<T extends InstCalc>(calc: T[], old: { numero_parcela: number; pago: boolean; data_pagamento: string | null }[]) {
  return calc.map((c) => {
    const o = old.find((x) => x.numero_parcela === c.numero_parcela);
    return { ...c, pago: o?.pago ?? false, data_pagamento: o?.data_pagamento ?? null };
  });
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let { y, m0 } = parseIso(from + "-01");
  const end = to;
  for (let i = 0; i < 240; i++) {
    const k = `${y}-${pad(m0 + 1)}`;
    if (k > end) break;
    out.push(k);
    m0++; if (m0 > 11) { m0 = 0; y++; }
  }
  return out;
}
