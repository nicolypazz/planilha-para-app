import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mesLabel, type Parcela, useFinance } from "@/lib/finance";

export interface F { mes: string; resp: string; cat: string; status: string }
export const allF: F = { mes: "all", resp: "all", cat: "all", status: "all" };

export function applyF(ps: Parcela[], f: F) {
  return ps.filter((p) => (f.mes === "all" || p.mesRef === f.mes) && (f.resp === "all" || p.lanc.responsavel === f.resp)
    && (f.cat === "all" || p.lanc.categoria === f.cat) && (f.status === "all" || p.status === f.status));
}

export function Filters({ f, setF, ps }: { f: F; setF: (f: F) => void; ps: Parcela[] }) {
  const { config } = useFinance();
  const meses = [...new Set(ps.map((p) => p.mesRef))].sort();
  const S = ({ k, ph, opts }: { k: keyof F; ph: string; opts: { v: string; l: string }[] }) => (
    <Select value={f[k]} onValueChange={(v) => setF({ ...f, [k]: v })}>
      <SelectTrigger className="h-9 w-full bg-card sm:w-40"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">{ph}</SelectItem>{opts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <S k="mes" ph="Todos os meses" opts={meses.map((m) => ({ v: m, l: mesLabel(m) }))} />
      <S k="resp" ph="Todos responsáveis" opts={config.responsaveis.map((v) => ({ v, l: v }))} />
      <S k="cat" ph="Todas categorias" opts={config.categorias.map((v) => ({ v, l: v }))} />
      <S k="status" ph="Todos status" opts={["Pago", "No Prazo", "Atrasado"].map((v) => ({ v, l: v }))} />
    </div>
  );
}
