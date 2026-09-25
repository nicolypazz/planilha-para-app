import * as XLSX from "xlsx";
import type { Tx } from "./data";
import { fmtDate, txDate, txLabel } from "./data";
import { statusOf } from "./engine";

export type ExportRow = Record<string, string | number>;

function rowsFromTxs(txs: Tx[]): ExportRow[] {
  return txs.flatMap((t) => {
    const mov = t.tipo_movimentacao as "Renda" | "Custo";
    return t.installments.map((i) => ({
      "ID": t.id, "Movimentação": mov, "Responsável": t.responsavel,
      "Data do lançamento": fmtDate(txDate(t)), "Descrição": txLabel(t),
      "Categoria": t.categoria ?? "", "Tipo de gasto": t.tipo_gasto ?? "", "Tipo de renda": t.tipo_renda ?? "",
      "Valor total": Number(t.valor_total), "Tipo de pagamento": t.tipo_pagamento ?? "",
      "Parcela": i.numero_parcela + "/" + i.total_parcelas, "Valor da parcela": Number(i.valor_parcela),
      "Data de vencimento": fmtDate(i.data_vencimento), "Quinzena": i.quinzena,
      "Status": statusOf(i, mov), "Pago": i.pago ? "Sim" : "Não", "Data de pagamento": fmtDate(i.data_pagamento),
    }));
  });
}

export function exportTransactions(txs: Tx[], format: "csv" | "xlsx", filename = "historico-financeiro") {
  const rows = rowsFromTxs(txs);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transações");
  if (format === "csv") XLSX.writeFile(wb, filename + ".csv", { bookType: "csv" });
  else XLSX.writeFile(wb, filename + ".xlsx");
}

export function exportConfigAndTransactions(txs: Tx[], config: { methods: { nome: string; dia_fechamento: number | null; dia_vencimento: number | null; utiliza_fechamento: boolean; ativo: boolean }[]; categories: { nome: string; ativo: boolean }[]; responsaveis: { nome: string; ativo: boolean }[]; sources: { nome: string; ativo: boolean }[] }, format: "csv" | "xlsx") {
  if (format === "csv") return exportTransactions(txs, "csv", "historico-financeiro");
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: ExportRow[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  add("Transações", rowsFromTxs(txs));
  add("Pagamentos", config.methods.map((m) => ({ "Nome": m.nome, "Fechamento": m.dia_fechamento ?? "", "Vencimento": m.dia_vencimento ?? "", "Usa fechamento": m.utiliza_fechamento ? "Sim" : "Não", "Ativo": m.ativo ? "Sim" : "Não" })));
  add("Categorias", config.categories.map((x) => ({ "Nome": x.nome, "Ativo": x.ativo ? "Sim" : "Não" })));
  add("Responsáveis", config.responsaveis.map((x) => ({ "Nome": x.nome, "Ativo": x.ativo ? "Sim" : "Não" })));
  add("Fontes de renda", config.sources.map((x) => ({ "Nome": x.nome, "Ativo": x.ativo ? "Sim" : "Não" })));
  XLSX.writeFile(wb, "backup-financeiro.xlsx");
}