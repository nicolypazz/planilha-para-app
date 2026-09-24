import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, brl, useFinance, type Config } from "@/lib/finance";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Controle Financeiro" },
      { name: "description", content: "Cartões, categorias, responsáveis e metas do seu controle financeiro." },
      { property: "og:title", content: "Configurações — Controle Financeiro" },
      { property: "og:description", content: "Cartões, categorias, responsáveis e metas do seu controle financeiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><h2 className="font-display font-semibold">{title}</h2>{children}</section>;
}

function ListEditor({ items, onChange, ph }: { items: string[]; onChange: (v: string[]) => void; ph: string }) {
  const [v, setV] = useState("");
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">{i}
            <button aria-label={`Remover ${i}`} onClick={() => onChange(items.filter((x) => x !== i))}><X className="h-3 w-3" /></button></span>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim() && !items.includes(v.trim())) onChange([...items, v.trim()]); setV(""); }}>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={ph} /><Button type="submit" size="icon" aria-label="Adicionar"><Plus className="h-4 w-4" /></Button>
      </form>
    </>
  );
}

function Page() {
  const { config } = useFinance();
  const set = (c: Partial<Config>) => actions.setConfig({ ...config, ...c });
  const [card, setCard] = useState({ nome: "", fechamento: 1, vencimento: 10 });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-display text-3xl font-bold">Configurações</h1>
      <Box title="Cartões (fechamento e vencimento)">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-primary text-left text-primary-foreground"><tr><th className="px-3 py-2">Cartão</th><th className="px-3 py-2">Fechamento</th><th className="px-3 py-2">Vencimento</th><th /></tr></thead>
            <tbody>
              {config.cartoes.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2">{c.nome}</td>
                  {(["fechamento", "vencimento"] as const).map((k) => (
                    <td key={k} className="px-3 py-1"><Input type="number" min={1} max={31} className="h-8 w-20" value={c[k]}
                      onChange={(e) => set({ cartoes: config.cartoes.map((x) => x.id === c.id ? { ...x, [k]: +e.target.value || 1 } : x) })} /></td>
                  ))}
                  <td className="px-2"><Button size="icon" variant="ghost" aria-label="Remover cartão" onClick={() => set({ cartoes: config.cartoes.filter((x) => x.id !== c.id) })}><X className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="grid grid-cols-[1fr_80px_80px_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (!card.nome.trim()) return; set({ cartoes: [...config.cartoes, { ...card, id: Math.random().toString(36).slice(2) }] }); setCard({ nome: "", fechamento: 1, vencimento: 10 }); }}>
          <Input placeholder="Novo cartão" value={card.nome} onChange={(e) => setCard({ ...card, nome: e.target.value })} />
          <Input type="number" min={1} max={31} value={card.fechamento} onChange={(e) => setCard({ ...card, fechamento: +e.target.value })} aria-label="Fechamento" />
          <Input type="number" min={1} max={31} value={card.vencimento} onChange={(e) => setCard({ ...card, vencimento: +e.target.value })} aria-label="Vencimento" />
          <Button type="submit" size="icon" aria-label="Adicionar cartão"><Plus className="h-4 w-4" /></Button>
        </form>
      </Box>
      <Box title="Categorias de gasto"><ListEditor items={config.categorias} onChange={(categorias) => set({ categorias })} ph="Nova categoria" /></Box>
      <Box title="Responsáveis"><ListEditor items={config.responsaveis} onChange={(responsaveis) => set({ responsaveis })} ph="Novo responsável" /></Box>
      <Box title="Outras formas de pagamento"><ListEditor items={config.pagamentos} onChange={(pagamentos) => set({ pagamentos })} ph="Ex.: Pix" /></Box>
      <Box title="Meta mensal de gasto">
        <div className="flex items-center gap-3"><Input type="number" className="w-40" value={config.metaGasto} onChange={(e) => set({ metaGasto: +e.target.value || 0 })} /><span className="text-sm text-muted-foreground">{brl(config.metaGasto)}</span></div>
      </Box>
      <Button variant="destructive" onClick={() => { if (confirm("Restaurar os dados originais da planilha? Isso apaga suas alterações.")) { actions.reset(); toast.success("Dados restaurados"); } }}>Restaurar dados da planilha</Button>
    </div>
  );
}
