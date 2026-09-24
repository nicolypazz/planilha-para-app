CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  dia_fechamento int,
  dia_vencimento int,
  utiliza_fechamento boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE, ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.responsible_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE, ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.income_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE, ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao IN ('Renda','Custo')),
  responsavel text NOT NULL,
  data_lancamento date NOT NULL DEFAULT current_date,
  data_compra date,
  data_recebimento date,
  descricao text NOT NULL DEFAULT '',
  categoria text,
  tipo_gasto text,
  tipo_renda text,
  valor_total numeric(12,2) NOT NULL CHECK (valor_total > 0),
  tipo_pagamento text,
  parcelado boolean NOT NULL DEFAULT false,
  numero_parcelas int NOT NULL DEFAULT 1 CHECK (numero_parcelas BETWEEN 1 AND 120),
  pago boolean NOT NULL DEFAULT false,
  data_pagamento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  numero_parcela int NOT NULL,
  total_parcelas int NOT NULL,
  valor_parcela numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  mes_vencimento text NOT NULL,
  quinzena text NOT NULL,
  pago boolean NOT NULL DEFAULT false,
  data_pagamento date,
  status text NOT NULL DEFAULT 'Pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, numero_parcela)
);
CREATE INDEX installments_venc_idx ON public.installments(data_vencimento);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods','categories','responsible_users','income_sources','transactions','installments'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Família: leitura" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Família: inclusão" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY "Família: edição" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY "Família: exclusão" ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER transactions_touch BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Configuração inicial (vinda da planilha)
INSERT INTO public.payment_methods (nome, dia_fechamento, dia_vencimento, utiliza_fechamento) VALUES
 ('Assai',14,20,true),('Shoppe parcelado',14,25,true),('itau',4,10,true),
 ('Debito/Pix/Dinheiro',NULL,NULL,false),('Limite',NULL,NULL,false);
INSERT INTO public.categories (nome) VALUES ('Alimentação'),('Assinaturas'),('Cosmetico (perfumaria)'),('Emprestimo'),('Lazer(bares e festas)'),('Moto'),('Transporte');
INSERT INTO public.responsible_users (nome) VALUES ('Nicoli'),('Natasha');
INSERT INTO public.income_sources (nome) VALUES ('Salário'),('Vale'),('iFood'),('Uber'),('99'),('Diária'),('Keeta'),('Lalamove'),('Freelance'),('Outros');

-- Lançamentos da planilha
INSERT INTO public.transactions (tipo_movimentacao, responsavel, data_compra, data_recebimento, descricao, categoria, tipo_gasto, tipo_renda, valor_total, tipo_pagamento, parcelado, numero_parcelas) VALUES
 ('Custo','Nicoli','2026-09-18',NULL,'','Cosmetico (perfumaria)','Variável',NULL,250,'Assai',true,2),
 ('Renda','Nicoli',NULL,'2026-09-18','Vale',NULL,NULL,'Fixa',1000,NULL,false,1),
 ('Custo','Nicoli','2026-09-18',NULL,'gasolina','Transporte','Variável',NULL,100,'Assai',false,1),
 ('Custo','Natasha','2026-09-13',NULL,'arroz','Alimentação','Variável',NULL,50,'itau',false,1),
 ('Custo','Nicoli','2026-09-14',NULL,'gin','Lazer(bares e festas)','Variável',NULL,40,'Debito/Pix/Dinheiro',false,1),
 ('Custo','Natasha','2026-09-03',NULL,'pgar itau','Emprestimo','Variável',NULL,1200,'Limite',false,1),
 ('Custo','Natasha','2026-09-06',NULL,'peça','Moto','Variável',NULL,1500,'itau',true,5),
 ('Renda','Nicoli',NULL,'2026-09-05','Salário',NULL,NULL,'Fixa',1000,NULL,false,1),
 ('Renda','Nicoli',NULL,'2026-09-05','Salário',NULL,NULL,'Fixa',1000,NULL,false,1),
 ('Renda','Natasha',NULL,'2026-09-20','99',NULL,NULL,'Variável',90,NULL,false,1),
 ('Custo','Nicoli','2026-09-14',NULL,'net','Assinaturas','Variável',NULL,60,'Assai',false,1),
 ('Custo','Nicoli','2026-09-15',NULL,'gas','Moto','Variável',NULL,20,'Assai',false,1),
 ('Custo','Nicoli','2026-09-14',NULL,'','Cosmetico (perfumaria)','Variável',NULL,100,'Assai',false,1),
 ('Custo','Nicoli','2026-09-14',NULL,'','Assinaturas','Variável',NULL,157,'Assai',false,1);

-- Parcelas calculadas com as mesmas regras do app
WITH b AS (
  SELECT t.*, pm.dia_fechamento f, pm.dia_vencimento v, coalesce(pm.utiliza_fechamento,false) uf
  FROM public.transactions t LEFT JOIN public.payment_methods pm ON pm.nome = t.tipo_pagamento
), g AS (
  SELECT b.*, n, date_trunc('month', coalesce(data_compra, data_recebimento))
      + make_interval(months => (CASE WHEN uf AND extract(day FROM data_compra) > f THEN 1 ELSE 0 END) + n - 1) AS m0
  FROM b, generate_series(1, b.numero_parcelas) n
), d AS (
  SELECT id tid, n, numero_parcelas tot,
    CASE WHEN n < numero_parcelas THEN round(valor_total / numero_parcelas, 2)
         ELSE valor_total - round(valor_total / numero_parcelas, 2) * (numero_parcelas - 1) END vp,
    CASE WHEN tipo_movimentacao = 'Renda' THEN data_recebimento
         WHEN uf THEN (m0::date + (least(v, extract(day FROM (m0 + interval '1 month' - interval '1 day'))::int) - 1))
         ELSE (data_compra + make_interval(months => n - 1))::date END venc
  FROM g
)
INSERT INTO public.installments (transaction_id, numero_parcela, total_parcelas, valor_parcela, data_vencimento, mes_vencimento, quinzena)
SELECT tid, n, tot, vp, venc, to_char(venc, 'YYYY-MM'), CASE WHEN extract(day FROM venc) <= 15 THEN 'Dia 10' ELSE 'Dia 20' END FROM d;
