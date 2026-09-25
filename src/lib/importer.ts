import { dupKey, type FinData, type PaidInfo, type TxDraft } from "./data";
import { todayIso, type Mov } from "./engine";

export type Field = "mov" | "responsavel" | "data" | "data_receb" | "descricao" | "descricao_renda" | "categoria" | "tipo_gasto" | "tipo_renda"
  | "valor" | "valor_renda" | "pagamento" | "parcelado" | "parcelas" | "pago" | "data_pagamento" | "parcelas_pagas";

export const FIELDS: { key: Field; label: string; aliases: string[] }[] = [
  { key: "mov", label: "Movimentação", aliases: ["movimentacao", "tipomovimentacao", "tipo", "mov"] },
  { key: "responsavel", label: "Responsável", aliases: ["responsavel", "quem"] },
  { key: "data", label: "Data da compra", aliases: ["datadacompra", "datacompra", "data", "datalancamento"] },
  { key: "data_receb", label: "Data do recebimento", aliases: ["datadorecebimento", "datarecebimento"] },
  { key: "descricao", label: "Descrição", aliases: ["descricao", "descricaodacompra"] },
  { key: "descricao_renda", label: "Descrição da renda", aliases: ["descricaodarenda"] },
  { key: "categoria", label: "Categoria", aliases: ["categoria", "categoriadogasto"] },
  { key: "tipo_gasto", label: "Tipo de gasto", aliases: ["tipodegasto", "tipogasto"] },
  { key: "tipo_renda", label: "Tipo de renda", aliases: ["tipoderenda", "tiporenda"] },
  { key: "valor", label: "Valor total", aliases: ["valortotal", "valor"] },
  { key: "valor_renda", label: "Valor da renda", aliases: ["valordarenda"] },
  { key: "pagamento", label: "Forma de pagamento", aliases: ["tipodepagamento", "formadepagamento", "pagamento"] },
  { key: "parcelado", label: "Parcelado", aliases: ["essegastofoiparcelado", "parcelado"] },
  { key: "parcelas", label: "Nº de parcelas", aliases: ["emquantasparcelas", "ndeparcelas", "nparcelas", "numerodeparcelas", "parcelas"] },
  { key: "pago", label: "Pago", aliases: ["pago", "jafoipago"] },
  { key: "data_pagamento", label: "Data de pagamento", aliases: ["datadepagamento", "datadopagamento", "datapagamento"] },
  { key: "parcelas_pagas", label: "Parcelas já pagas", aliases: ["parcelaspagas", "parcelasjapagas", "qtdparcelaspagas"] },
];
export const MODEL_HEADERS = ["Data", "Movimentação", "Responsável", "Descrição", "Categoria", "Tipo de gasto", "Valor", "Tipo de pagamento", "Parcelado", "Nº de parcelas", "Pago", "Data de pagamento", "Parcelas já pagas", "Tipo de renda"];

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export type Mapping = Partial<Record<Field, string>>;
export interface Raw { headers: string[]; rows: Record<string, unknown>[] }

export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {}; const used = new Set<string>();
  for (const f of FIELDS) for (const a of f.aliases) {
    const h = headers.find((x) => !used.has(x) && norm(x) === a);
    if (h) { m[f.key] = h; used.add(h); break; }
  }
  return m;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (m) { let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000; return valid(y, +m[2]!, +m[1]!); }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}
const valid = (y: number, mo: number, d: number) => {
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
};
export function parseMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/R\$|\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const yes = (v: unknown) => ["sim", "s", "yes", "y", "true", "1", "x", "pago"].includes(norm(String(v ?? "")));
const str = (v: unknown) => (v == null ? "" : String(v).trim());

export interface Parsed { line: number; draft?: TxDraft; paid?: PaidInfo; errors: string[]; dup: boolean; missing: { cat?: string; pag?: string; resp?: string } }

export function buildRows(raw: Raw, map: Mapping, data: FinData, firstLine = 2): Parsed[] {
  const existing = new Set(data.txs.map((t) => dupKey({ ...t, valor_total: Number(t.valor_total) })));
  const seen = new Set<string>();
  const find = (list: { nome: string }[], v: string) => list.find((x) => norm(x.nome) === norm(v))?.nome;
  return raw.rows.map((r, idx) => {
    const g = (f: Field) => (map[f] ? r[map[f]!] : undefined);
    const errors: string[] = []; const missing: Parsed["missing"] = {};
    const movRaw = norm(str(g("mov")));
    let mov: Mov = movRaw.startsWith("rend") || movRaw.startsWith("rece") || movRaw === "entrada" ? "Renda"
      : movRaw.startsWith("cust") || movRaw.startsWith("desp") || movRaw === "saida" ? "Custo"
      : (str(g("valor_renda")) || str(g("data_receb")) || str(g("descricao_renda"))) ? "Renda" : "Custo";
    if (movRaw && !["renda", "custo"].some((x) => movRaw.startsWith(x.slice(0, 4))) && !/^(rece|desp|entrada|saida)/.test(movRaw)) errors.push(`Movimentação "${str(g("mov"))}" não reconhecida`);
    const data1 = parseDate(mov === "Renda" ? (g("data_receb") ?? g("data")) || g("data") : g("data") || g("data_receb"));
    const valor = parseMoney(mov === "Renda" ? (str(g("valor_renda")) ? g("valor_renda") : g("valor")) : (str(g("valor")) ? g("valor") : g("valor_renda")));
    const respRaw = str(g("responsavel")); const resp = find(data.responsaveis, respRaw);
    if (!data1) errors.push("Data inválida ou ausente");
    if (!valor || valor <= 0) errors.push("Valor inválido");
    if (!respRaw) errors.push("Responsável ausente"); else if (!resp) { errors.push(`Responsável "${respRaw}" não cadastrado`); missing.resp = respRaw; }
    const descricao = str(mov === "Renda" ? g("descricao_renda") || g("descricao") : g("descricao"));
    let categoria: string | null = null, pagamento: string | null = null, n = 1;
    const tg = norm(str(g("tipo_gasto"))), tr = norm(str(g("tipo_renda")) || (mov === "Renda" ? str(g("tipo_gasto")) : ""));
    if (mov === "Custo") {
      const c = str(g("categoria")); categoria = c ? find(data.categories, c) ?? null : null;
      if (!c) errors.push("Categoria ausente"); else if (!categoria) { errors.push(`Categoria "${c}" não cadastrada`); missing.cat = c; }
      const p = str(g("pagamento")); pagamento = p ? find(data.methods, p) ?? null : null;
      if (!p) errors.push("Forma de pagamento ausente"); else if (!pagamento) { errors.push(`Forma de pagamento "${p}" não cadastrada`); missing.pag = p; }
      const np = parseInt(str(g("parcelas")));
      const parc = map.parcelado ? yes(g("parcelado")) : np > 1;
      n = parc ? (np || 0) : 1;
      if (parc && !(n >= 2 && n <= 120)) errors.push("Parcelado sem nº de parcelas válido (2 a 120)");
    } else if (!descricao) errors.push("Descrição da renda ausente");
    const pagasRaw = parseInt(str(g("parcelas_pagas")));
    const isPago = yes(g("pago"));
    const pagas = mov === "Renda" ? 0 : Number.isFinite(pagasRaw) ? pagasRaw : isPago ? n : 0;
    if (pagas > n) errors.push(`Parcelas pagas (${pagas}) maior que o total (${n})`);
    const dp = parseDate(g("data_pagamento"));
    if (str(g("data_pagamento")) && !dp) errors.push("Data de pagamento inválida");
    const draft: TxDraft | undefined = errors.length ? undefined : {
      tipo_movimentacao: mov, responsavel: resp!, data_compra: mov === "Custo" ? data1 : null, data_recebimento: mov === "Renda" ? data1 : null,
      descricao, categoria, pagamento: undefined as never, tipo_pagamento: pagamento, valor_total: valor!, numero_parcelas: Math.max(1, n),
      tipo_gasto: mov === "Custo" ? (tg.startsWith("fix") ? "Fixo" : "Variável") : null,
      tipo_renda: mov === "Renda" ? (tr.startsWith("fix") ? "Fixa" : "Variável") : null,
    } as TxDraft;
    if (draft) delete (draft as Partial<TxDraft> & { pagamento?: unknown }).pagamento;
    let dup = false;
    if (draft) { const key = dupKey(draft); dup = existing.has(key) || seen.has(key); seen.add(key); }
    void mov;
    return { line: firstLine + idx, draft, paid: pagas > 0 ? { parcelasPagas: pagas, dataPagamento: dp } : undefined, errors, dup, missing };
  });
}

export function parsePasted(text: string): Raw {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const cells = lines.map((l) => l.split("\t"));
  const first = cells[0]!;
  const looksHeader = Object.keys(autoMap(first)).length >= 2;
  const headers = looksHeader ? first.map((h, i) => h.trim() || `Coluna ${i + 1}`) : MODEL_HEADERS.slice(0, Math.max(...cells.map((c) => c.length)));
  const body = looksHeader ? cells.slice(1) : cells;
  return { headers, rows: body.map((c) => Object.fromEntries(headers.map((h, i) => [h, c[i]?.trim() ?? ""]))) };
}

export const today = todayIso;
