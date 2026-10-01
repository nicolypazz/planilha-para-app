create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor >= 0),
  tipo_pagamento text,
  dia integer not null check (dia between 1 and 31),
  responsavel text not null,
  periodicidade text not null default 'Mensal' check (periodicidade in ('Mensal','Anual')),
  mes_anual integer check (mes_anual is null or mes_anual between 1 and 12),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists custo_fixo_id uuid references public.fixed_costs(id) on delete set null,
  add column if not exists competencia_fixa text;

create unique index if not exists transactions_fixed_cost_competencia_uq
  on public.transactions(custo_fixo_id, competencia_fixa)
  where custo_fixo_id is not null and competencia_fixa is not null;

alter table public.fixed_costs enable row level security;

drop policy if exists "fixed_costs authenticated access" on public.fixed_costs;
create policy "fixed_costs authenticated access"
  on public.fixed_costs for all
  to authenticated
  using (true)
  with check (true);

create index if not exists fixed_costs_ativo_idx on public.fixed_costs(ativo);
