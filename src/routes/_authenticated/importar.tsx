import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, FileText, Upload, Sparkles, ClipboardPaste, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { bulkInsert, dupKey, useFin, useRefresh, type TxDraft } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/importar")({ component: Page });

type Raw = Record<string, unknown>;
type Field = "tipo_movimentacao" | "responsavel" | "data" | "descricao" | "categoria" | "tipo_gasto" | "valor" | "tipo_pagamento" | "parcelado" | "parcelas" | "tipo_renda";
const fields: { key: Field; label: string; required?: boolean }[] = [
  { key: "tipo_movimentacao", label: "Movimentação", required: true },
  { key: "responsavel", label: "Responsável" },
  { key: "data", label: "Data", required: true },
  { key: "descricao", label: "Descrição", required: true },
  { key: "categoria", label: "Categoria" },
  { key: "tipo_gasto", label: "Tipo de gasto" },
  { key: "valor", label: "Valor", required: true },
  { key: "tipo_pagamento", label: "Tipo de pagamento" },
  { key: "parcelado", label: "Parcelado" },
  { key: "parcelas", label: "Nº de parcelas" },
  { key: "tipo_renda", label: "Tipo de renda" },
];

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const aliases: Record<Field, string[]> = {
  tipo_movimentacao: ["movimentacao", "movimento", "tipo movimentacao", "movimentação", "movimentação?"],
  responsavel: ["responsavel", "responsável", "quem", "pessoa"],
  data: ["data", "data da compra", "data da compra?", "data do lançamento", "data recebimento"],
  descricao: ["descricao", "descrição", "descricao compra", "descricao renda", "histórico", "historico"],
  categoria: ["categoria", "categoria do gasto", "categoria do gasto?"],
  tipo_gasto: ["tipo de gasto", "tipo gasto", "tipo de gasto?"],
  valor: ["valor", "valor total", "valor total?", "valor renda"],
  tipo_pagamento: ["tipo de pagamento", "pagamento", "forma de pagamento"],
  parcelado: ["parcelado", "parcelado?", "esse gasto foi parcelado"],
  parcelas: ["parcelas", "nº de parcelas", "numero de parcelas", "quantidade de parcelas"],
  tipo_renda: ["tipo de renda"],
};

function guess(headers: string[]): Record<Field, string> {
  const out = {} as Record<Field, string>;
  for (const f of fields) {
    const a = aliases[f.key].map(norm);
    const h = headers.find(x => a.includes(norm(x)) || a.some(y => norm(x).includes(y)));
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
function bool(v: unknown) { return ["sim", "s", "true", "1", "yes"].includes(norm(v)); }

function toDraft(r: Raw, map: Record<Field, string>): TxDraft {
  const get = (f: Field) => r[map[f]];
  const mov = norm(get("tipo_movimentacao")).startsWith("r") ? "Renda" : "Custo";
  const data = parseDate(get("data"));
  const parcelas = Math.max(1, Number(get("parcelas")) || 1);
  return {
    tipo_movimentacao: mov,
    responsavel: String(get("responsavel") || "Não informado").trim(),
    data_compra: mov === "Custo" ? data : null,
    data_recebimento: mov === "Renda" ? data : null,
    descricao: String(get("descricao") || "").trim(),
    categoria: String(get("categoria") || "").trim() || null,
    tipo_gasto: String(get("tipo_gasto") || "").trim() || null,
    tipo_renda: String(get("tipo_renda") || "").trim() || null,
    valor_total: money(get("valor")),
    tipo_pagamento: String(get("tipo_pagamento") || "").trim() || null,
    numero_parcelas: mov === "Renda" ? 1 : (bool(get("parcelado")) ? parcelas : 1),
  };
}

function modelFile() {
  const rows = [{
    "Movimentação": "Custo", "Responsável": "Nicoly", "Data": "25/09/2026", "Descrição": "Exemplo",
    "Categoria": "Alimentação", "Tipo de gasto": "Variável", "Valor": 100, "Tipo de pagamento": "Pix",
    "Parcelado": "Não", "Nº de parcelas": 1, "Tipo de renda": ""
  }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Importar");
  XLSX.writeFile(wb, "modelo_importacao_financeira.xlsx");
}

function Page() {
  const { data, isLoading } = useFin();
  const refresh = useRefresh();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"arquivo" | "colar" | "ia">("arquivo");
  const [raw, setRaw] = useState<Raw[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<Field, string>>({} as Record<Field, string>);
  const [text, setText] = useState("");
  const [extrato, setExtrato] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const drafts = useMemo(() => raw.map(r => toDraft(r, map)), [raw, map]);
  const duplicateKeys = useMemo(() => {
    const existing = new Set((data?.txs ?? []).map(t => dupKey({ tipo_movimentacao: t.tipo_movimentacao, data_compra: t.data_compra, data_recebimento: t.data_recebimento, valor_total: Number(t.valor_total), responsavel: t.responsavel, descricao: t.descricao })));
    const seen = new Set<string>();
    return drafts.map(d => {
      const k = dupKey({ tipo_movimentacao: d.tipo_movimentacao, data_compra: d.data_compra, data_recebimento: d.data_recebimento, valor_total: d.valor_total, responsavel: d.responsavel, descricao: d.descricao });
      const dup = existing.has(k) || seen.has(k); seen.add(k); return dup;
    });
  }, [drafts, data]);

  const valid = drafts.filter((d, i) => d.descricao && d.valor_total > 0 && (d.data_compra || d.data_recebimento) && !duplicateKeys[i]);
  const invalid = drafts.length - valid.length;

  const readRows = (rows: Raw[]) => {
    const hs = Object.keys(rows[0] ?? {});
    setHeaders(hs); setRaw(rows); setMap(guess(hs)); setConfirmed(false);
  };

  async function readFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      readRows(XLSX.utils.sheet_to_json<Raw>(ws, { defval: "" }));
      toast.success("Arquivo lido. Confira o mapeamento antes de confirmar.");
    } catch { toast.error("Não foi possível ler o arquivo."); }
  }

  function pasteExcel() {
    try {
      const rows = XLSX.utils.sheet_to_json<Raw>(XLSX.read(text, { type: "string", raw: false }).Sheets[XLSX.read(text, { type: "string", raw: false }).SheetNames[0]], { defval: "" });
      if (!rows.length) throw new Error();
      readRows(rows); toast.success(`${rows.length} linhas carregadas.`);
    } catch { toast.error("Cole o conteúdo copiado do Excel, incluindo a primeira linha com os cabeçalhos."); }
  }

  async function analyzeStatement() {
    if (!extrato.trim()) return toast.error("Cole o texto do extrato primeiro.");
    setAiBusy(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("parse-statement", { body: { text: extrato } });
      if (error) throw error;
      const items = Array.isArray(result?.transactions) ? result.transactions : [];
      if (!items.length) throw new Error("A IA não encontrou transações.");
      const rows = items.map((x: Record<string, unknown>) => ({
        "Movimentação": x.tipo_movimentacao ?? "Custo", "Responsável": x.responsavel ?? "Não informado",
        "Data": x.data ?? "", "Descrição": x.descricao ?? "", "Categoria": x.categoria ?? "",
        "Tipo de gasto": x.tipo_gasto ?? "", "Valor": x.valor ?? 0, "Tipo de pagamento": x.tipo_pagamento ?? "",
        "Parcelado": x.parcelado ?? "Não", "Nº de parcelas": x.parcelas ?? 1, "Tipo de renda": x.tipo_renda ?? "",
      }));
      readRows(rows); setTab("arquivo"); toast.success(`${rows.length} transações extraídas. Revise antes de confirmar.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao analisar o extrato."); }
    finally { setAiBusy(false); }
  }

  async function confirmImport() {
    if (!valid.length) return toast.error("Não há lançamentos válidos para importar.");
    setConfirmed(false);
    try {
      await bulkInsert(valid.map(d => ({ draft: d })), data!.methods);
      await refresh(); setConfirmed(true);
      toast.success(`${valid.length} lançamentos importados.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao importar."); }
  }

  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  return <div className="mx-auto max-w-7xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-3xl font-bold">Importar</h1><p className="text-sm text-muted-foreground">Importe vários lançamentos, revise os dados e confirme tudo de uma vez.</p></div>
      <Button variant="outline" onClick={modelFile}><Download />Baixar modelo</Button>
    </div>

    <div className="flex gap-2 rounded-xl bg-muted p-1 w-fit">
      {([["arquivo","Excel / CSV",FileSpreadsheet],["colar","Colar Excel",ClipboardPaste],["ia","Extrato com IA",Sparkles]] as const).map(([id,label,Icon]) =>
        <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-2 text-sm ${tab === id ? "bg-background shadow" : "text-muted-foreground"}`}><Icon className="mr-2 inline h-4 w-4"/>{label}</button>
      )}
    </div>

    {tab === "arquivo" && <section className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}/>
        <Button onClick={() => fileRef.current?.click()}><Upload />Selecionar Excel/CSV</Button>
        <span className="text-sm text-muted-foreground">XLSX, XLS ou CSV</span>
      </div>
    </section>}

    {tab === "colar" && <section className="panel space-y-3 p-5">
      <div className="flex items-center gap-2"><ClipboardPaste className="h-5 w-5 text-highlight"/><h2 className="font-display font-semibold">Cole os dados copiados do Excel</h2></div>
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Selecione as células no Excel, Ctrl+C e cole aqui..." className="min-h-48 font-mono text-xs"/>
      <Button onClick={pasteExcel}>Ler dados colados</Button>
    </section>}

    {tab === "ia" && <section className="panel space-y-3 p-5">
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-highlight"/><h2 className="font-display font-semibold">Extrato bancário com IA</h2></div>
      <p className="text-sm text-muted-foreground">Cole o texto do extrato. A IA extrai data, descrição, valor, tipo, categoria e forma de pagamento. Nada é salvo sem sua confirmação.</p>
      <Textarea value={extrato} onChange={e => setExtrato(e.target.value)} placeholder="Cole aqui o texto copiado do banco..." className="min-h-56 font-mono text-xs"/>
      <Button onClick={analyzeStatement} disabled={aiBusy}>{aiBusy ? "Analisando…" : "Extrair e categorizar com IA"} <Sparkles /></Button>
    </section>}

    {headers.length > 0 && <section className="panel space-y-4 p-5">
      <div><h2 className="font-display font-semibold">1. Mapeamento de colunas</h2><p className="text-xs text-muted-foreground">Revise como cada coluna do arquivo será interpretada.</p></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {fields.map(f => <div key={f.key}><label className="mb-1 block text-xs font-medium">{f.label}{f.required ? " *" : ""}</label>
          <Select value={map[f.key] || "__none"} onValueChange={v => setMap(m => ({ ...m, [f.key]: v === "__none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="Não mapear"/></SelectTrigger><SelectContent><SelectItem value="__none">Não mapear</SelectItem>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>)}
      </div>
    </section>}

    {drafts.length > 0 && <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-display font-semibold">2. Prévia e validação</h2><p className="text-xs text-muted-foreground">{drafts.length} linhas · {valid.length} prontas · {invalid} com erro ou duplicidade.</p></div>
        {invalid > 0 && <span className="flex items-center gap-1 text-xs text-overdue"><AlertTriangle className="h-4 w-4"/>Revise as linhas destacadas</span>}
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[1050px] text-xs">
          <thead className="bg-muted text-muted-foreground"><tr>{["Status","Mov.","Data","Descrição","Categoria","Valor","Pagamento","Parcelas","Responsável"].map(h=><th key={h} className="p-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{drafts.map((d,i)=><tr key={i} className={duplicateKeys[i] || !d.descricao || !d.valor_total || !(d.data_compra || d.data_recebimento) ? "bg-overdue/10" : "border-t border-border"}>
            <td className="p-2">{duplicateKeys[i] ? <span className="text-overdue">Duplicado</span> : (!d.descricao || !d.valor_total || !(d.data_compra || d.data_recebimento)) ? <span className="text-overdue">Inválido</span> : <span className="text-paid">OK</span>}</td>
            <td className="p-2">{d.tipo_movimentacao}</td><td className="p-2">{d.data_compra || d.data_recebimento || "—"}</td><td className="p-2">{d.descricao || "—"}</td><td className="p-2">{d.categoria || "—"}</td><td className="p-2 font-semibold">{d.valor_total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td className="p-2">{d.tipo_pagamento || "—"}</td><td className="p-2">{d.numero_parcelas}</td><td className="p-2">{d.responsavel}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">Duplicidades são bloqueadas por movimentação + data + valor + responsável + descrição.</p>
        <Button onClick={confirmImport} disabled={!valid.length}><CheckCircle2 />Confirmar {valid.length} lançamentos</Button>
      </div>
      {confirmed && <div className="rounded-lg bg-paid/10 p-3 text-sm text-paid">Importação concluída.</div>}
    </section>}
  </div>;
}
