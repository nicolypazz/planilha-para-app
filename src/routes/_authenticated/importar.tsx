import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Upload, Sparkles, ClipboardPaste, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { bulkInsert, dupKey, useFin, useRefresh, type TxDraft } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/importar")({ component: Page });

type Raw = Record<string, unknown>;
type Field =
  | "tipo_movimentacao"
  | "responsavel"
  | "data"
  | "descricao"
  | "categoria"
  | "tipo_gasto"
  | "valor"
  | "tipo_pagamento"
  | "parcelado"
  | "parcelas"
  | "tipo_renda";
type ImportMode = "renda" | "custo";

const fields: { key: Field; label: string }[] = [
  { key: "tipo_movimentacao", label: "Movimentação" },
  { key: "responsavel", label: "Responsável" },
  { key: "data", label: "Data" },
  { key: "descricao", label: "Descrição" },
  { key: "categoria", label: "Categoria" },
  { key: "tipo_gasto", label: "Tipo de gasto" },
  { key: "valor", label: "Valor" },
  { key: "tipo_pagamento", label: "Tipo de pagamento" },
  { key: "parcelado", label: "Parcelado" },
  { key: "parcelas", label: "Nº de parcelas" },
  { key: "tipo_renda", label: "Tipo de renda" },
];

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const aliases: Record<Field, string[]> = {
  tipo_movimentacao: ["movimentacao", "movimento", "tipo movimentacao", "movimentação", "movimentação?"],
  responsavel: ["responsavel", "responsável", "quem", "pessoa"],
  data: ["data", "data da compra", "data da compra?", "data do lançamento", "data recebimento", "data do recebimento", "data do recebimento?"],
  descricao: ["descricao", "descrição", "descricao compra", "descricao renda", "histórico", "historico"],
  categoria: ["categoria", "categoria do gasto", "categoria do gasto?"],
  tipo_gasto: ["tipo de gasto", "tipo gasto", "tipo de gasto?"],
  valor: ["valor", "valor total", "valor total?", "valor renda", "valor recebido", "valor recebido?"],
  tipo_pagamento: ["tipo de pagamento", "pagamento", "forma de pagamento"],
  parcelado: ["parcelado", "parcelado?", "esse gasto foi parcelado"],
  parcelas: ["parcelas", "nº de parcelas", "numero de parcelas", "quantidade de parcelas"],
  tipo_renda: ["tipo de renda"],
};

function guess(headers: string[]): Record<Field, string> {
  const out = {} as Record<Field, string>;
  for (const f of fields) {
    const a = aliases[f.key].map(norm);
    const h = headers.find((x) => a.includes(norm(x)) || a.some((y) => norm(x).includes(y)));
    out[f.key] = h ?? "";
  }
  return out;
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return null;
}

function money(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/R\$\s?/gi, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Number(s.replace(/[^0-9.-]/g, "")) || 0;
}

function bool(v: unknown) {
  return ["sim", "s", "true", "1", "yes"].includes(norm(v));
}

function cleanStatementText(text: string): string {
  const balanceTerms =
    /saldo\s+(do\s+dia|anterior|disponivel|bloqueado|final)|total\s+(do\s+dia|de\s+entradas|de\s+saidas)/i;
  const dateRe = /(?:^|\s)(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)(?:\s|$)/;
  const moneyRe = /[-+]?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}|[-+]?R?\$?\s?\d+,\d{2}/g;
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let current = "";

  for (const line of lines) {
    if (balanceTerms.test(line)) continue;
    if (dateRe.test(line)) {
      if (current) blocks.push(current);
      current = line;
    } else if (current) {
      current += " " + line;
    }
    moneyRe.lastIndex = 0;
  }

  if (current) blocks.push(current);

  return blocks
    .filter((block) => dateRe.test(block) && moneyRe.test(block))
    .map((block) => {
      const amounts = block.match(moneyRe) ?? [];
      return amounts.length > 1
        ? block + " [ATENÇÃO: se houver dois valores monetários, o último normalmente é saldo acumulado; não lançar saldo como transação.]"
        : block;
    })
    .join("\n");
}

function toDraft(r: Raw, map: Record<Field, string>, mode: ImportMode): TxDraft {
  const get = (f: Field) => (map[f] ? r[map[f]] : "");
  const renda = mode === "renda";
  const rawMovement = norm(get("tipo_movimentacao"));
  const movement =
    rawMovement.includes("renda")
      ? "Renda"
      : rawMovement.includes("custo")
        ? "Custo"
        : renda
          ? "Renda"
          : "Custo";
  const isIncome = movement === "Renda";
  const data = parseDate(get("data"));
  const parcelas = Math.max(1, Number(get("parcelas")) || 1);

  return {
    tipo_movimentacao: movement,
    responsavel: String(get("responsavel") || "Não informado").trim(),
    data_compra: isIncome ? null : data,
    data_recebimento: isIncome ? data : null,
    descricao: isIncome ? "" : String(get("descricao") || "").trim(),
    categoria: String(get("categoria") || "").trim() || null,
    tipo_gasto: isIncome ? null : String(get("tipo_gasto") || "").trim() || null,
    tipo_renda: isIncome ? String(get("tipo_renda") || "").trim() || null : null,
    valor_total: Math.abs(money(get("valor"))),
    tipo_pagamento: isIncome ? null : String(get("tipo_pagamento") || "").trim() || null,
    numero_parcelas: isIncome ? 1 : bool(get("parcelado")) ? parcelas : 1,
  };
}

function downloadModel(mode: ImportMode) {
  const rows =
    mode === "renda"
      ? [
          {
            Responsável: "Nicoli",
            "Data do Recebimento": "25/09/2026",
            Categoria: "Salário",
            "Tipo de Renda": "Fixa",
            "Valor Recebido": 3386.83,
          },
        ]
      : [
          {
            Responsável: "Natasha",
            "Data da Compra": "25/09/2026",
            Descrição: "Exemplo",
            Categoria: "Alimentação",
            "Tipo de Gasto": "Variável",
            "Valor Total": 100,
            "Tipo de Pagamento": "Pix",
            "Parcelado?": "Não",
            "Nº de Parcelas": 1,
          },
        ];

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, mode === "renda" ? "Renda" : "Custos");
  const prefix = mode === "renda" ? "modelo_importacao_renda" : "modelo_importacao_custos";
  XLSX.writeFile(wb, prefix + ".xlsx");
}

function Page() {
  const { data, isLoading } = useFin();
  const refresh = useRefresh();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"arquivo" | "colar" | "ia">("arquivo");
  const [mode, setMode] = useState<ImportMode>("custo");
  const [raw, setRaw] = useState<Raw[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<Field, string>>({} as Record<Field, string>);
  const [text, setText] = useState("");
  const [extrato, setExtrato] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<
    Record<number, Partial<Pick<TxDraft, "categoria" | "responsavel" | "valor_total">>>
  >({});

  const drafts = raw.map((r) => toDraft(r, map, mode));
  const editedDrafts = drafts.map((d, i) => ({ ...d, ...(edits[i] ?? {}) }));

  const duplicateKeys = useMemo(() => {
    const existing = new Set(
      (data?.txs ?? []).map((t) =>
        dupKey({
          tipo_movimentacao: t.tipo_movimentacao,
          data_compra: t.data_compra,
          data_recebimento: t.data_recebimento,
          valor_total: Number(t.valor_total),
          responsavel: t.responsavel,
          descricao: t.descricao,
        }),
      ),
    );
    const seen = new Set<string>();

    return editedDrafts.map((d) => {
      const key = dupKey({
        tipo_movimentacao: d.tipo_movimentacao,
        data_compra: d.data_compra,
        data_recebimento: d.data_recebimento,
        valor_total: d.valor_total,
        responsavel: d.responsavel,
        descricao: d.descricao,
      });
      const duplicate = existing.has(key) || seen.has(key);
      seen.add(key);
      return duplicate;
    });
  }, [editedDrafts, data]);

  const requiredFields: Field[] =
    mode === "renda"
      ? ["responsavel", "data", "categoria", "tipo_renda", "valor"]
      : ["responsavel", "data", "descricao", "categoria", "tipo_gasto", "valor", "tipo_pagamento", "parcelado", "parcelas"];

  const mappingReady = requiredFields.every((f) => !!map[f]);

  const rowIsInvalid = (d: TxDraft, i: number) =>
    (d.tipo_movimentacao === "Custo" && !d.descricao) ||
    !d.valor_total ||
    !(d.data_compra || d.data_recebimento) ||
    duplicateKeys[i];

  const valid = editedDrafts.filter((d, i) => selectedRows.has(i) && !rowIsInvalid(d, i));
  const invalid = editedDrafts.filter((d, i) => selectedRows.has(i) && rowIsInvalid(d, i)).length;

  const readRows = (rows: Raw[]) => {
    const hs = Object.keys(rows[0] ?? {});
    const detected =
      hs.some((h) => ["valor recebido", "data do recebimento", "tipo de renda"].includes(norm(h))) &&
      !hs.some((h) => ["valor total", "data da compra", "tipo de pagamento"].includes(norm(h)))
        ? "renda"
        : "custo";

    setMode(detected);
    setHeaders(hs);
    setRaw(rows);
    setMap(guess(hs));
    setConfirmed(false);
    setSelectedRows(new Set(rows.map((_, i) => i)));
    setEdits({});
  };

  async function readFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Raw>(ws, { defval: "" });
      if (!rows.length) throw new Error();
      readRows(rows);
      toast.success("Arquivo lido. Confira o mapeamento antes de confirmar.");
    } catch {
      toast.error("Não foi possível ler o arquivo.");
    }
  }

  function pasteExcel() {
    try {
      const wb = XLSX.read(text, { type: "string", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Raw>(ws, { defval: "" });
      if (!rows.length) throw new Error();
      readRows(rows);
      toast.success(`${rows.length} linhas carregadas.`);
    } catch {
      toast.error("Cole o conteúdo copiado do Excel, incluindo a primeira linha com os cabeçalhos.");
    }
  }

  async function analyzeStatement(sourceText = extrato) {
    const cleaned = cleanStatementText(sourceText);
    if (!cleaned.trim()) {
      toast.error("Não encontrei linhas de movimentação válidas no extrato.");
      return;
    }

    setAiBusy(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("parse-statement", {
        body: {
          text:
            "EXTRATO SANITIZADO PARA ANÁLISE:\n" +
            cleaned +
            "\n\nREGRAS: ignore SALDO DO DIA, SALDO ANTERIOR e saldo acumulado. Negativo = Custo; positivo = Renda. Converta 2.449,64 e -174,29 corretamente. NATASHA na descrição = Natasha; NICOLI = Nicoli. Retorne somente movimentações reais.",
          categories: (data?.categories ?? []).map((x) => x.nome),
          payment_methods: (data?.methods ?? []).map((x) => x.nome),
          responsaveis: (data?.responsaveis ?? []).map((x) => x.nome),
        },
      });

      if (error) throw error;

      const items = Array.isArray(result?.transactions) ? result.transactions : [];
      if (!items.length) throw new Error("A IA não encontrou transações.");

      const rows = items.map((x: Record<string, unknown>) => {
        const signed = money(x.valor ?? x.valor_total ?? 0);
        const isIncome = signed >= 0;
        const description = String(x.descricao ?? "");
        const nd = norm(description);
        const responsible = nd.includes("natasha")
          ? "Natasha"
          : nd.includes("nicoli")
            ? "Nicoli"
            : String(x.responsavel ?? "Não informado");

        return {
          Movimentação: isIncome ? "Renda" : "Custo",
          Responsável: responsible,
          Data: x.data ?? "",
          Descrição: description,
          Categoria: x.categoria ?? "",
          "Tipo de gasto": x.tipo_gasto ?? "",
          Valor: Math.abs(signed),
          "Tipo de pagamento": x.tipo_pagamento ?? "",
          Parcelado: x.parcelado ?? "Não",
          "Nº de parcelas": x.parcelas ?? 1,
          "Tipo de renda": x.tipo_renda ?? (isIncome ? "Variável" : ""),
        };
      });

      readRows(rows);
      setTab("arquivo");
      toast.success(`${rows.length} transações extraídas. Revise, edite ou desmarque antes de confirmar.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao analisar o extrato.");
    } finally {
      setAiBusy(false);
    }
  }

  async function confirmImport() {
    if (!mappingReady) {
      toast.error("Mapeie as colunas obrigatórias do modelo selecionado antes de confirmar.");
      return;
    }
    if (!valid.length) {
      toast.error("Não há lançamentos válidos para importar.");
      return;
    }

    setConfirmed(false);
    try {
      await bulkInsert(valid.map((d) => ({ draft: d })), data!.methods);
      await refresh();
      setConfirmed(true);
      toast.success(`${valid.length} lançamentos importados.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar.");
    }
  }

  if (isLoading || !data) {
    return <div className="p-8 text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Importar</h1>
          <p className="text-sm text-muted-foreground">
            Importe vários lançamentos, revise os dados e confirme tudo de uma vez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadModel("renda")}>
            <Download />Baixar Modelo de Renda (.xlsx)
          </Button>
          <Button variant="outline" onClick={() => downloadModel("custo")}>
            <Download />Baixar Modelo de Custos (.xlsx)
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="panel border-income/30 bg-income/5 p-4">
          <h2 className="font-display font-semibold">Modelo de Importação: RENDA (Simplificado)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Responsável · Data do Recebimento · Categoria · Tipo de Renda · Valor Recebido.
            Movimentação será definida como Renda e Parcelas = 1 automaticamente.
          </p>
        </section>
        <section className="panel border-expense/30 bg-expense/5 p-4">
          <h2 className="font-display font-semibold">Modelo de Importação: CUSTOS</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Responsável · Data da Compra · Descrição · Categoria · Tipo de Gasto · Valor Total ·
            Tipo de Pagamento · Parcelado? · Nº de Parcelas.
          </p>
        </section>
      </div>

      <div className="flex w-fit gap-2 rounded-xl bg-muted p-1">
        {(
          [
            ["arquivo", "Excel / CSV", FileSpreadsheet],
            ["colar", "Colar Excel", ClipboardPaste],
            ["ia", "Extrato com IA", Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <Icon className="mr-2 inline h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "arquivo" && (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
            />
            <Button onClick={() => fileRef.current?.click()}>
              <Upload />Selecionar Excel/CSV
            </Button>
            <span className="text-sm text-muted-foreground">
              XLSX, XLS ou CSV · modelo detectado: <b>{mode === "renda" ? "Renda" : "Custos"}</b>
            </span>
          </div>
        </section>
      )}

      {tab === "colar" && (
        <section className="panel space-y-3 p-5">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-highlight" />
            <h2 className="font-display font-semibold">Cole os dados copiados do Excel</h2>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Selecione as células no Excel, Ctrl+C e cole aqui..."
            className="min-h-48 font-mono text-xs"
          />
          <Button onClick={pasteExcel}>Ler dados colados</Button>
        </section>
      )}

      {tab === "ia" && (
        <section className="panel space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-highlight" />
            <h2 className="font-display font-semibold">Extrato bancário com IA</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Cole o texto do extrato bancário. A IA identifica as movimentações e mostra tudo em
            prévia antes de qualquer gravação.
          </p>
          <Textarea
            value={extrato}
            onChange={(e) => setExtrato(e.target.value)}
            placeholder="Cole aqui o texto do extrato bancário..."
            className="min-h-40 font-mono text-xs"
          />
          <Button onClick={() => analyzeStatement(extrato)} disabled={aiBusy || !extrato.trim()}>
            {aiBusy ? "Analisando…" : "Extrair e categorizar com IA"} <Sparkles />
          </Button>
        </section>
      )}

      {headers.length > 0 && (
        <section className="panel space-y-4 p-5">
          <div>
            <h2 className="font-display font-semibold">
              1. Mapeamento de colunas — {mode === "renda" ? "Renda" : "Custos"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Revise como cada coluna do arquivo será interpretada. Os campos obrigatórios variam
              conforme o modelo.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium">
                  {f.label}
                  {requiredFields.includes(f.key) ? " *" : ""}
                </label>
                <Select
                  value={map[f.key] || "__none"}
                  onValueChange={(v) =>
                    setMap((m) => ({ ...m, [f.key]: v === "__none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Não mapear" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Não mapear</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="panel space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-semibold">2. Prévia e validação</h2>
              <p className="text-xs text-muted-foreground">
                {editedDrafts.length} linhas · {valid.length} prontas · {invalid} com erro ou
                duplicidade.
              </p>
            </div>
            {invalid > 0 && (
              <span className="flex items-center gap-1 text-xs text-overdue">
                <AlertTriangle className="h-4 w-4" />
                Revise as linhas destacadas
              </span>
            )}
          </div>

          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[1180px] text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {["Importar", "Status", "Mov.", "Data", "Descrição", "Categoria", "Valor", "Pagamento", "Parcelas", "Responsável"].map(
                    (h) => (
                      <th key={h} className="p-2 text-left font-medium">{h}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {editedDrafts.map((d, i) => {
                  const invalidRow = rowIsInvalid(d, i);
                  const selected = selectedRows.has(i);
                  const setEdit = (
                    patch: Partial<Pick<TxDraft, "categoria" | "responsavel" | "valor_total">>,
                  ) =>
                    setEdits((prev) => ({
                      ...prev,
                      [i]: { ...(prev[i] ?? {}), ...patch },
                    }));

                  return (
                    <tr
                      key={i}
                      className={
                        invalidRow
                          ? "border-t border-border bg-overdue/10"
                          : "border-t border-border"
                      }
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) =>
                            setSelectedRows((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(i);
                              else next.delete(i);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="p-2">
                        {duplicateKeys[i] ? (
                          <span className="text-overdue">Duplicado</span>
                        ) : invalidRow ? (
                          <span className="text-overdue">Inválido</span>
                        ) : (
                          <span className="text-paid">OK</span>
                        )}
                      </td>
                      <td className="p-2">{d.tipo_movimentacao}</td>
                      <td className="p-2">{d.data_compra || d.data_recebimento || "—"}</td>
                      <td className="max-w-[220px] p-2">{d.descricao || (mode === "renda" ? d.tipo_renda || "—" : "—")}</td>
                      <td className="p-2">
                        <Input
                          value={d.categoria ?? ""}
                          onChange={(e) => setEdit({ categoria: e.target.value })}
                          className="h-8 w-40 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={String(d.valor_total)}
                          onChange={(e) => setEdit({ valor_total: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-8 w-32 text-xs"
                        />
                      </td>
                      <td className="p-2">{d.tipo_pagamento || "—"}</td>
                      <td className="p-2">{d.numero_parcelas}</td>
                      <td className="p-2">
                        <Input
                          value={d.responsavel}
                          onChange={(e) => setEdit({ responsavel: e.target.value })}
                          className="h-8 w-36 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Desmarque linhas que não deseja importar. Categoria, responsável e valor podem ser
              corrigidos antes do salvamento.
            </p>
            <Button onClick={confirmImport} disabled={!valid.length || !mappingReady}>
              <CheckCircle2 />Confirmar Importação ({valid.length})
            </Button>
          </div>

          {confirmed && (
            <div className="rounded-lg bg-paid/10 p-3 text-sm text-paid">
              Importação concluída.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
