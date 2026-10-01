import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { recalcAllCosts, recalcMethod, useFin, useRefresh, type Method, type Named } from "@/lib/data";
import { exportConfigAndTransactions } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Controle de Financeiro" },
      { name: "description", content: "Cartões, fechamento, vencimento, categorias, responsáveis e fontes de renda." },
      { property: "og:title", content: "Configurações — Controle de Financeiro" },
      { property: "og:description", content: "Cartões, fechamento, vencimento, categorias, responsáveis e fontes de renda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type ListTable = "categories" | "responsible_users" | "income_sources";
const txColumn: Record<ListTable, "categoria" | "responsavel" | "descricao"> = { categories: "categoria", responsible_users: "responsavel", income_sources: "descricao" };

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="panel space-y-3 p-4"><div><h2 className="font-display font-semibold">{title}</h2>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>{children}</section>;
}

function Page() {
  const { data } = useFin();
  const refresh = useRefresh();
  const [novo, setNovo] = useState({ nome: "", fech: "", venc: "" });
  if (!data) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, msg?: string) => {
    const { error } = await fn();
    if (error) { toast.error(error.message.includes("duplicate") ? "Esse nome já existe." : error.message); return false; }
    await refresh(); if (msg) toast.success(msg); return true;
  };

  async function updateMethod(m: Method, patch: Partial<Method>) {
    const next = { ...m, ...patch };
    if (next.utiliza_fechamento && (!next.dia_fechamento || !next.dia_vencimento)) { toast.error("Informe fechamento e vencimento (1 a 31)."); return; }
    const okk = await run(() => supabase.from("payment_methods").update(patch).eq("id", m.id));
    if (!okk) return;
    if (patch.nome && patch.nome !== m.nome) await supabase.from("transactions").update({ tipo_pagamento: patch.nome }).eq("tipo_pagamento", m.nome);
    if ("dia_fechamento" in patch || "dia_vencimento" in patch || "utiliza_fechamento" in patch || patch.nome) {
      await recalcMethod(next.nome, data!.methods.map((x) => (x.id === m.id ? next : x)), data!.txs.map((t) => t.tipo_pagamento === m.nome ? { ...t, tipo_pagamento: next.nome } : t));
      await refresh(); toast.success("Vencimentos recalculados");
    }
  }

  async function recalcHistorico() {
    try {
      await recalcAllCosts(data.methods, data.txs);
      await refresh();
      toast.success("Compras antigas recalculadas e pagamentos à vista ajustados");
    } catch (err) {
      toast.error(`Não foi possível recalcular: ${(err as Error).message}`);
    }
  }

  async function addMethod(e: React.FormEvent) {
    e.preventDefault();
    const nome = novo.nome.trim(); if (!nome) return;
    const f = parseInt(novo.fech), v = parseInt(novo.venc);
    const uses = !!(f && v);
    if (await run(() => supabase.from("payment_methods").insert({ nome, dia_fechamento: uses ? f : null, dia_vencimento: uses ? v : null, utiliza_fechamento: uses }), "Forma de pagamento criada")) setNovo({ nome: "", fech: "", venc: "" });
  }

  const day = (v: string) => { const n = parseInt(v); return n >= 1 && n <= 31 ? n : null; };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-3xl font-bold">Configurações</h1><p className="text-sm text-muted-foreground">Backup completo dos dados financeiros e das configurações.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={recalcHistorico}><RefreshCw className="mr-2 h-4 w-4" />Recalcular compras antigas</Button>
          <Button variant="outline" onClick={() => { exportConfigAndTransactions(data.txs, data, "csv"); toast.success("Backup CSV baixado"); }}><Download className="mr-2 h-4 w-4" />Backup CSV</Button>
          <Button variant="outline" onClick={() => { exportConfigAndTransactions(data.txs, data, "xlsx"); toast.success("Backup Excel baixado"); }}><Download className="mr-2 h-4 w-4" />Backup Excel</Button>
        </div>
      </div>
      <Box title="Cartões e formas de pagamento" hint="Com fechamento: compra depois do dia de fechamento vai para a fatura do mês seguinte. Sem fechamento (Pix, débito, dinheiro): vence na data da compra.">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Forma de pagamento</th><th>Usa fechamento</th><th>Fechamento</th><th>Vencimento</th><th>Ativo</th></tr></thead>
            <tbody>
              {data.methods.map((m) => (
                <tr key={m.id} className={`border-t border-border ${m.ativo ? "" : "opacity-50"}`}>
                  <td className="py-2 pr-2"><Input key={m.nome} defaultValue={m.nome} className="h-8" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.nome) updateMethod(m, { nome: v }); }} /></td>
                  <td><Switch checked={m.utiliza_fechamento} onCheckedChange={(c) => updateMethod(m, c ? { utiliza_fechamento: true, dia_fechamento: m.dia_fechamento ?? 1, dia_vencimento: m.dia_vencimento ?? 10 } : { utiliza_fechamento: false })} /></td>
                  {(["dia_fechamento", "dia_vencimento"] as const).map((k) => (
                    <td key={k} className="pr-2"><Input key={`${m.id}${m[k]}`} type="number" min={1} max={31} disabled={!m.utiliza_fechamento} defaultValue={m[k] ?? ""} className="h-8 w-20"
                      onBlur={(e) => { const n = day(e.target.value); if (n && n !== m[k]) updateMethod(m, { [k]: n }); }} /></td>
                  ))}
                  <td><Switch checked={m.ativo} onCheckedChange={(c) => updateMethod(m, { ativo: c })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="grid grid-cols-[1fr_90px_90px_auto] gap-2" onSubmit={addMethod}>
          <Input placeholder="Nova forma de pagamento" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <Input type="number" min={1} max={31} placeholder="Fech." value={novo.fech} onChange={(e) => setNovo({ ...novo, fech: e.target.value })} aria-label="Dia de fechamento" />
          <Input type="number" min={1} max={31} placeholder="Venc." value={novo.venc} onChange={(e) => setNovo({ ...novo, venc: e.target.value })} aria-label="Dia de vencimento" />
          <Button type="submit" size="icon" aria-label="Adicionar"><Plus className="h-4 w-4" /></Button>
        </form>
        <p className="text-xs text-muted-foreground">Deixe fechamento e vencimento em branco para formas sem fatura.</p>
      </Box>
      <FixedCostsBox data={data} refresh={refresh} />
      <ListBox title="Categorias de gasto" table="categories" items={data.categories} run={run} />
      <ListBox title="Responsáveis" table="responsible_users" items={data.responsaveis} run={run} />
      <ListBox title="Fontes de renda (sugestões)" table="income_sources" items={data.sources} run={run} />
      <Box title="Tipos" hint="Valores fixos usados nos lançamentos.">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-secondary px-3 py-1">Gasto: Fixo</span><span className="rounded-full bg-secondary px-3 py-1">Gasto: Variável</span>
          <span className="rounded-full bg-secondary px-3 py-1">Renda: Fixa</span><span className="rounded-full bg-secondary px-3 py-1">Renda: Variável</span>
        </div>
      </Box>
    </div>
  );
}

function ListBox({ title, table, items, run }: { title: string; table: ListTable; items: Named[]; run: (fn: () => PromiseLike<{ error: { message: string } | null }>, msg?: string) => Promise<boolean> }) {
  const [v, setV] = useState("");
  const rename = async (it: Named, nome: string) => {
    if (!nome || nome === it.nome) return;
    if (await run(() => supabase.from(table).update({ nome }).eq("id", it.id), "Nome atualizado")) {
      await supabase.from("transactions").update({ [txColumn[table]]: nome } as never).eq(txColumn[table], it.nome);
    }
  };
  return (
    <Box title={title} hint="Desativar esconde a opção em novos lançamentos, sem apagar o histórico.">
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.id} className={`flex items-center gap-2 rounded-lg bg-muted px-2 py-1 ${it.ativo ? "" : "opacity-50"}`}>
            <Input key={it.nome} defaultValue={it.nome} className="h-8 border-none bg-transparent" onBlur={(e) => rename(it, e.target.value.trim())} />
            <Switch checked={it.ativo} onCheckedChange={(c) => run(() => supabase.from(table).update({ ativo: c }).eq("id", it.id))} aria-label="Ativo" />
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const n = v.trim(); if (n && await run(() => supabase.from(table).insert({ nome: n }), "Adicionado")) setV(""); }}>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Adicionar…" /><Button type="submit" size="icon" aria-label="Adicionar"><Plus className="h-4 w-4" /></Button>
      </form>
    </Box>
  );
}


function FixedCostsBox({ data, refresh }: { data: any; refresh: () => Promise<unknown> }) {
  const client = supabase as any;
  const empty = { nome: "", descricao: "", categoria: "", valor: "", tipo_pagamento: "", dia: "1", responsavel: "", periodicidade: "Mensal", mes_anual: "" };
  const [form, setForm] = useState(empty);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: rows, error } = await client.from("fixed_costs").select("*").order("ativo", { ascending: false }).order("dia");
    if (!error) setItems(rows ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.responsavel || !form.tipo_pagamento || !form.valor || !form.dia) {
      toast.error("Preencha nome, valor, forma de pagamento, dia e responsável.");
      return;
    }
    const { error } = await client.from("fixed_costs").insert({
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || form.nome.trim(),
      categoria: form.categoria || null,
      valor: Number(form.valor),
      tipo_pagamento: form.tipo_pagamento,
      dia: Number(form.dia),
      responsavel: form.responsavel,
      periodicidade: "Mensal",
      mes_anual: null,
      ativo: true,
    });
    if (error) { toast.error(error.message); return; }
    setForm(empty);
    await load();
    await refresh();
    toast.success("Custo fixo cadastrado");
  };

  const patch = async (id: string, values: Record<string, unknown>) => {
    const { error } = await client.from("fixed_costs").update(values).eq("id", id);
    if (error) toast.error(error.message);
    else { await load(); await refresh(); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Excluir este custo fixo? Os lançamentos históricos não serão apagados.")) return;
    const { error } = await client.from("fixed_costs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { await load(); await refresh(); toast.success("Custo fixo excluído"); }
  };

  const activeMethods = data.methods.filter((m: any) => m.ativo);
  const activeCats = data.categories.filter((x: any) => x.ativo);
  const activeResp = data.responsaveis.filter((x: any) => x.ativo);

  return (
    <Box title="Custos Fixos" hint="O aplicativo cria automaticamente o custo mensal no início do mês. Alterações aqui valem para os próximos lançamentos e não alteram o histórico.">
      <form onSubmit={save} className="grid gap-2 md:grid-cols-6">
        <Input placeholder="Nome (ex.: Aluguel)" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
          <option value="">Categoria</option>
          {activeCats.map((x: any) => <option key={x.id} value={x.nome}>{x.nome}</option>)}
        </select>
        <Input type="number" min="0" step="0.01" placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.tipo_pagamento} onChange={(e) => setForm({ ...form, tipo_pagamento: e.target.value })}>
          <option value="">Forma de pagamento</option>
          {activeMethods.map((x: any) => <option key={x.id} value={x.nome}>{x.nome}</option>)}
        </select>
        <Input type="number" min="1" max="31" placeholder="Dia" value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })}>
          <option value="">Responsável</option>
          {activeResp.map((x: any) => <option key={x.id} value={x.nome}>{x.nome}</option>)}
        </select>
        <div className="md:col-span-5 flex items-center text-xs text-muted-foreground">Periodicidade: Mensal (estrutura já preparada para Anual)</div>
        <Button type="submit"><Plus className="mr-2 h-4 w-4" />Adicionar custo fixo</Button>
      </form>

      {loading ? <p className="text-sm text-muted-foreground">Carregando custos fixos…</p> : items.length === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Nenhum custo fixo cadastrado.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-2">Custo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Pagamento</th><th>Dia</th><th>Responsável</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={it.ativo ? "border-t border-border" : "border-t border-border opacity-50"}>
                  <td className="py-2 pr-2"><Input defaultValue={it.nome} className="h-8" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== it.nome && patch(it.id, { nome: e.target.value.trim() })} /></td>
                  <td className="pr-2"><Input defaultValue={it.descricao} className="h-8" onBlur={(e) => e.target.value.trim() !== it.descricao && patch(it.id, { descricao: e.target.value.trim() })} /></td>
                  <td className="pr-2"><select className="h-8 rounded-md border border-input bg-background px-2 text-xs" defaultValue={it.categoria ?? ""} onChange={(e) => patch(it.id, { categoria: e.target.value || null })}><option value="">—</option>{activeCats.map((x: any) => <option key={x.id} value={x.nome}>{x.nome}</option>)}</select></td>
                  <td className="pr-2"><Input type="number" min="0" step="0.01" defaultValue={it.valor} className="h-8 w-24" onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== Number(it.valor)) patch(it.id, { valor: v }); }} /></td>
                  <td className="pr-2"><select className="h-8 rounded-md border border-input bg-background px-2 text-xs" defaultValue={it.tipo_pagamento ?? ""} onChange={(e) => patch(it.id, { tipo_pagamento: e.target.value })}>{activeMethods.map((x: any) => <option key={x.id} value={x.nome}>{x.nome}</option>)}</select></td>
                  <td className="pr-2"><Input type="number" min="1" max="31" defaultValue={it.dia} className="h-8 w-16" onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 31 && v !== Number(it.dia)) patch(it.id, { dia: v }); }} /></td>
                  <td className="pr-2"><select className="h-8 rounded-md border border-input bg-background px-2 text-xs" defaultValue={it.responsavel} onChange={(e) => patch(it.id, { responsavel: e.target.value })}>{activeResp.map((x: any) => <option key={x.id} value={x.nome}>{x.nome}</option>)}</select></td>
                  <td><Switch checked={it.ativo} onCheckedChange={(c) => patch(it.id, { ativo: c })} /></td>
                  <td><Button variant="ghost" size="icon" onClick={() => remove(it.id)} aria-label="Excluir custo fixo"><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
