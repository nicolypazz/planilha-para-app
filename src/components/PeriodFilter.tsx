import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MESES } from "@/lib/data";

export interface Period { mode: "mes" | "ano" | "custom"; year: number; month: number; from: string; to: string }
export const defaultPeriod = (): Period => {
  const d = new Date(); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { mode: "mes", year: d.getFullYear(), month: d.getMonth(), from: ym, to: ym };
};
/** Intervalo de meses (yyyy-mm) inclusivo do período. */
export function range(p: Period): [string, string] {
  const pad = (n: number) => String(n + 1).padStart(2, "0");
  if (p.mode === "mes") return [`${p.year}-${pad(p.month)}`, `${p.year}-${pad(p.month)}`];
  if (p.mode === "ano") return [`${p.year}-01`, `${p.year}-12`];
  return p.from <= p.to ? [p.from, p.to] : [p.to, p.from];
}
export const inRange = (mes: string, r: [string, string]) => mes >= r[0] && mes <= r[1];

export function PeriodFilter({ p, setP }: { p: Period; setP: (p: Period) => void }) {
  const shift = (k: number) => {
    if (p.mode === "ano") return setP({ ...p, year: p.year + k });
    let m = p.month + k, y = p.year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setP({ ...p, mode: "mes", month: m, year: y });
  };
  const tab = (m: Period["mode"], l: string) => (
    <button onClick={() => setP({ ...p, mode: m })} className={`rounded-md px-3 py-1 text-xs font-semibold ${p.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
  );
  return (
    <div className="panel space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-highlight" />
        <div className="flex rounded-lg bg-muted p-0.5">{tab("mes", "Mês")}{tab("ano", "Ano")}{tab("custom", "Personalizado")}</div>
        {p.mode !== "custom" && (
          <div className="ml-auto flex items-center gap-1">
            <button aria-label="Anterior" onClick={() => shift(-1)} className="rounded-md p-1.5 hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-12 text-center font-display text-sm font-semibold">{p.year}</span>
            <button aria-label="Próximo" onClick={() => shift(1)} className="rounded-md p-1.5 hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {p.mode === "mes" && (
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
          {MESES.map((m, i) => (
            <button key={m} onClick={() => setP({ ...p, month: i })}
              className={`rounded-md py-1.5 text-xs font-semibold ${p.month === i ? "bg-highlight text-background glow" : "bg-muted text-muted-foreground hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      )}
      {p.mode === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          De <Input type="month" className="h-9 w-40" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} />
          até <Input type="month" className="h-9 w-40" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
