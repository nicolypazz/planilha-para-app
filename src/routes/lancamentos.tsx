import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Copy, Paperclip, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LancamentoDialog } from "@/components/LancamentoDialog";
import { Filters, allF, applyF } from "@/components/Filters";
import { actions, brl, fmtDate, parcelas, useFinance, type Lancamento } from "@/lib/finance";

export const Route = createFileRoute("/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos — Controle Financeiro" },
      { name: "description", content: "Cadastre, edite e acompanhe custos, rendas e parcelas." },
      { property: "og:title", content: "Lançamentos — Controle Financeiro" },
      { property: "og:description", content: "Cadastre, edite e acompanhe custos, rendas e parcelas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const badge: Record<string, string> = { Pago: "bg-success/20 text-success", "No Prazo": "bg-warning/20 text-warning", Atrasado: "bg-destructive/20 text-destructive" };
const PER = 15;

function Page() {
  const { lancamentos, config } = useFinance();
  const [view, setView] = useState<"lanc" | "fin">("fin");
  const [f, setF] = useState(allF);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Lancamento | null>(null);
  const all = useMemo(() => parcelas(lancamentos, config), [lancamentos, config]);
  const txt = (l: Lancamento) => `${l.descricao} ${l.categoria} ${l.responsavel} ${l.pagamento}`.toLowerCase().includes(q.toLowerCase());
  const rows = applyF(all, f).filter((p) => txt(p.lanc));
  const lancs = lancamentos.filter(txt).sort((a, b) => b.data.localeCompare(a.data));
  const list = view === "fin" ? rows : lancs;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const slice = <T,>(a: T[]) => a.slice(page * PER, page * PER + PER);

  const Actions = ({ l }: { l: Lancamento }) => (
    <div className="flex justify-end gap-1">
      {l.anexo && <Button size="icon" variant="ghost" asChild><a href={l.anexo} target="_blank" rel="noreferrer" aria-label="Comprovante"><Paperclip className="h-4 w-4" /></a></Button>}
      <Button size="icon" variant="ghost" aria-label="Duplicar" onClick={() => { actions.duplicate(l.id); toast.success("Duplicado para o mês seguinte"); }}><Copy className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setEdit(l); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => { if (confirm("Excluir este lançamento?")) actions.remove(l.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-end justify-between gap-2">
        <h1 className="font-display text-3xl font-bold">Lançamentos</h1>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Novo</Button>
      </div>
      <Tabs value={view} onValueChange={(v) => { setView(v as "lanc" | "fin"); setPage(0); }}>
        <TabsList><TabsTrigger value="fin">Financeiro (parcelas)</TabsTrigger><TabsTrigger value="lanc">Lançamentos</TabsTrigger></TabsList>
      </Tabs>
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="bg-card pl-9" placeholder="Buscar descrição, categoria, responsável…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
      {view === "fin" && <Filters f={f} setF={(x) => { setF(x); setPage(0); }} ps={all} />}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-primary text-left text-primary-foreground">
            {view === "fin" ? (
              <tr>{["Pago", "Vencimento", "Mov.", "Responsável", "Descrição", "Categoria", "Pagamento", "Parcela", "Valor", "Status", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
            ) : (
              <tr>{["Data", "Mov.", "Responsável", "Descrição", "Categoria", "Tipo", "Pagamento", "Parcelas", "Valor total", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
            )}
          </thead>
          <tbody>
            {view === "fin" ? slice(rows).map((p) => (
              <tr key={p.key} className="border-t border-border odd:bg-muted/40">
                <td className="px-3 py-2"><Checkbox checked={p.status === "Pago"} onCheckedChange={() => actions.togglePaga(p.lanc.id, p.n)} /></td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(p.vencimento)}</td>
                <td className="px-3 py-2">{p.lanc.mov}</td>
                <td className="px-3 py-2">{p.lanc.responsavel}</td>
                <td className="px-3 py-2">{p.lanc.descricao || "—"}</td>
                <td className="px-3 py-2">{p.lanc.categoria || "—"}</td>
                <td className="px-3 py-2">{p.lanc.pagamento || "—"}</td>
                <td className="px-3 py-2">{p.label}</td>
                <td className={`whitespace-nowrap px-3 py-2 font-semibold ${p.lanc.mov === "Renda" ? "text-success" : ""}`}>{brl(p.valor)}</td>
                <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${badge[p.status]}`}>{p.status}</span></td>
                <td className="px-3 py-2"><Actions l={p.lanc} /></td>
              </tr>
            )) : slice(lancs).map((l) => (
              <tr key={l.id} className="border-t border-border odd:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(l.data)}</td>
                <td className="px-3 py-2">{l.mov}</td>
                <td className="px-3 py-2">{l.responsavel}</td>
                <td className="px-3 py-2">{l.descricao || "—"}</td>
                <td className="px-3 py-2">{l.categoria || "—"}</td>
                <td className="px-3 py-2">{l.tipo}</td>
                <td className="px-3 py-2">{l.pagamento || "—"}</td>
                <td className="px-3 py-2">{l.parcelas}x</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{brl(l.valor)}</td>
                <td className="px-3 py-2"><Actions l={l} /></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{list.length} registros</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span>{page + 1}/{pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      </div>
      <LancamentoDialog open={open} onOpenChange={setOpen} edit={edit} />
    </div>
  );
}
