# Controle de Financeiro — Arquitetura e plano por fases

## Visão geral
Hoje o app guarda tudo só no navegador. Ele vai passar a usar um banco de dados real (Lovable Cloud), com login para Nicoli e Natasha. Os dados são **compartilhados** entre as duas. Toda a lógica da planilha fica em um "motor financeiro" central. Dashboard, Transações e Importação usam esse mesmo motor, então cards e gráficos sempre mostram os mesmos números.

Menu: Dashboard · Novo lançamento (botão fixo) · Transações · Importar · Configurações.

## Regras financeiras (motor)
- **Ciclo do cartão:** se o dia da compra for maior que o dia de fechamento, a compra entra na fatura do mês seguinte. Se for igual ou menor, entra na fatura do mês atual.
- **Vencimento:** mês da fatura + dia de vencimento da forma de pagamento. Se o mês tiver menos dias, usa o último dia do mês.
- **Formas sem fechamento** (Pix, débito, dinheiro, limite): vencimento = data da compra. Cada forma de pagamento terá a opção "utiliza fechamento" (sim/não).
- **Parcelas:** 1 compra gera N parcelas, cada uma no valor total ÷ N. Os centavos que sobram vão para a última parcela. A parcela k vence k−1 meses depois da primeira.
- **Status:** Pago (marcado manualmente, com data de pagamento) · Atrasado (não pago e vencimento antes de hoje) · Pendente (não pago e ainda não venceu). "Pago depois do vencimento" fica guardado só como informação interna.
- **Quinzena:** vencimento até o dia 15 = "Dia 10"; depois do dia 15 = "Dia 20". É o padrão da planilha, a confirmar.
- **Renda:** fica como um único registro (1 parcela) que vence na data do recebimento. Não entra em "a pagar" nem em "atrasado".
- **Período:** custos são contados pelo mês de vencimento da parcela. Renda é contada pelo mês do recebimento. Saldo = Renda − Custos.

## Fases
1. **Banco de dados:** tabelas de transações, parcelas, formas de pagamento, categorias, responsáveis e fontes de renda. Os dados atuais da planilha entram como exemplo inicial.
2. **Motor financeiro:** cálculos com testes automáticos cobrindo compra antes e depois do fechamento, parcelas que atravessam meses (inclusive a virada de ano) e status.
3. **Novo lançamento:** primeiro escolhe Renda ou Custo, depois mostra só os campos daquele tipo. Nunca pede o vencimento. Mostra uma prévia das parcelas calculadas antes de salvar.
4. **Configurações:** tabela editável de formas de pagamento (nome, fechamento, vencimento, usa fechamento, ativo) e listas de categorias, responsáveis e fontes de renda, com opção de desativar.
5. **Transações:** filtros completos, editar e excluir, e compras parceladas que abrem para mostrar as parcelas. Ao marcar uma parcela como paga, abre a data de pagamento já preenchida com hoje.
6. **Importação:** arquivo .xlsx/.csv, colar do Excel e tabela para vários lançamentos. Inclui mapeamento de colunas, validação linha a linha, prévia, aviso de duplicados (revisar / ignorar / importar mesmo assim), histórico já pago (informando quantas parcelas já foram pagas) e botão para baixar o modelo Excel.
7. **Dashboard:** filtro de mês (Jan–Dez, anterior/próximo, ano, período personalizado), 5 cards de resumo, Categorias de Custos, Quinzena, Tipo de Pagamento, Pagamentos e Vencimentos, Renda Variável Natasha, Evolução do Saldo, Despesas por Mês, Maiores Gastos e Últimos Lançamentos.
8. **Visual:** fundo azul-marinho escuro, brilho discreto e cores por significado (turquesa, magenta, ciano, verde, âmbar, vermelho e lilás), ajustado para celular.
9. **Testes:** os 35 testes obrigatórios, feitos no motor e na tela.

## Detalhes técnicos
- Tabelas: `transactions`, `installments` (FK, cascade), `payment_methods`, `categories`, `responsible_users`, `income_sources`. Acesso restrito a usuários logados (RLS).
- O motor fica em `src/lib/engine.ts` (funções puras, testadas com vitest). As parcelas são recalculadas e gravadas ao salvar a transação ou ao mudar o fechamento/vencimento de um cartão. Nesse recálculo, os campos pago/data de pagamento são mantidos.
- Leitura de Excel com SheetJS no navegador. Gravação em lote por server functions.
- Gráficos com Recharts, todos alimentados por um único seletor de "parcelas do período".
