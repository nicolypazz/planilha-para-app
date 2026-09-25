import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function extractJson(text: string) {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Resposta da IA não contém JSON válido.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const { text, categories = [], payment_methods = [], responsaveis = [] } = await req.json().catch(() => ({ text: "" }));
  if (typeof text !== "string" || text.trim().length < 10) return json({ error: "Extrato vazio ou muito curto." }, 400);
  if (text.length > 50000) return json({ error: "Extrato muito grande. Limite de 50.000 caracteres." }, 413);

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "LOVABLE_API_KEY não configurada no projeto." }, 500);

  const prompt = `Você transforma texto de extrato bancário em lançamentos financeiros. Retorne SOMENTE JSON válido, sem markdown, no formato:
{"transactions":[{"tipo_movimentacao":"Custo","data":"YYYY-MM-DD","descricao":"...","valor":123.45,"categoria":"...","tipo_gasto":"...","tipo_pagamento":"...","parcelado":"Não","parcelas":1,"responsavel":"Não informado","tipo_renda":""}]}
Regras:
- Uma transação por lançamento real do extrato.
- Não invente datas ou valores. Se uma linha não for uma transação, ignore.
- Valor sempre positivo; use Custo para débitos/pagamentos e Renda para créditos/entradas.
- Categorize de forma conservadora. Quando a lista de categorias configuradas pelo usuário estiver disponível, escolha exatamente uma delas; caso contrário, use uma categoria curta e objetiva.
- Se não houver informação para forma de pagamento, parcelamento, responsável ou tipo de renda, use vazio ou "Não informado".
- Para datas sem ano, use o ano inferível do próprio extrato; se não for possível, não invente: use "".
Categorias configuradas: ${JSON.stringify(categories)}\nFormas de pagamento configuradas: ${JSON.stringify(payment_methods)}\nResponsáveis configurados: ${JSON.stringify(responsaveis)}\n\nTexto do extrato:
---BEGIN---
${text}
---END---`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um extrator de dados financeiros preciso. Nunca invente dados." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return json({ error: `AI Gateway retornou ${response.status}: ${detail.slice(0, 300)}` }, 502);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return json({ error: "A resposta do AI Gateway não trouxe conteúdo." }, 502);
    return json(extractJson(content));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Falha ao consultar o AI Gateway." }, 500);
  }
});
