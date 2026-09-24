import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Filters, allF, applyF } from "@/components/Filters";
import { brl, groupSum, parcelas, toCSV, useFinance } from "@/lib/finance";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Controle Financeiro" },
      { name: "description", content: "Resumo por categoria, responsável e pagamento, com exportação em Excel e PDF." },
      { property: "og:title", content: "Relatórios — Controle Financeiro" },
      { property: "og:description", content: "Resumo por categoria, responsável e pagamento, com exportação em Excel e PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Table({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <h3 className="bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {data.map((d) => (
            <tr key={d.name} className="border-t border-border">
              <td className="px-4 py-2">{d.name || "—"}</td>
              <td className="px-4 py-2 text-right">{brl(d.value)}</td>
              <td className="w-16 px-4 py-2 text-right text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</td>
            </tr>
          ))}
          <tr className="border-t border-border bg-muted font-semibold"><td className="px-4 py-2">Total geral</td><td className="px-4 py-2 text-right">{brl(total)}</td><td /></tr>
        </tbody>
      </table>
    </section>
  );
}

function Page() {
  const { lancamentos, config } = useFinance();
  const [f, setF] = useState(allF);
  const all = useMemo(() => parcelas(lancamentos, config), [lancamentos, config]);
  const ps = applyF(all, f);
  const c = ps.filter((p) => p.lanc.mov === "Custo");
  const r = ps.filter((p) => p.lanc.mov === "Renda");
  const totC = c.reduce((s, p) => s + p.valor, 0);

  function csv() {
    const blob = new Blob([toCSV(ps)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "financeiro.csv"; a.click();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-3xl font-bold">Relatórios</h1>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={csv}><FileDown className="mr-1 h-4 w-4" />Excel / CSV</Button>
          <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />PDF</Button>
        </div>
      </div>
      <div className="print:hidden"><Filters f={f} setF={setF} ps={all} /></div>
      {config.metaGasto > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex justify-between text-sm"><span>Meta de gasto</span><span>{brl(totC)} de {brl(config.metaGasto)}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${totC > config.metaGasto ? "bg-destructive" : "bg-chart-1"}`} style={{ width: `${Math.min(100, (totC / config.metaGasto) * 100)}%` }} />
          </div>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Table title="Custo x Renda" data={[{ name: "Custo", value: totC }, { name: "Renda", value: r.reduce((s, p) => s + p.valor, 0) }]} />
        <Table title="Status dos pagamentos" data={groupSum(c, (p) => p.status, (p) => p.valor)} />
        <Table title="Gasto por categoria" data={groupSum(c, (p) => p.lanc.categoria, (p) => p.valor)} />
        <Table title="Gasto por tipo de pagamento" data={groupSum(c, (p) => p.lanc.pagamento, (p) => p.valor)} />
        <Table title="Gasto por responsável" data={groupSum(c, (p) => p.lanc.responsavel, (p) => p.valor)} />
        <Table title="Renda por responsável" data={groupSum(r, (p) => `${p.lanc.responsavel} · ${p.lanc.tipo}`, (p) => p.valor)} />
        <Table title="Gasto por quinzena" data={groupSum(c, (p) => p.quinzena, (p) => p.valor)} />
        <Table title="Gasto por tipo" data={groupSum(c, (p) => p.lanc.tipo, (p) => p.valor)} />
      </div>
    </div>
  );
}
