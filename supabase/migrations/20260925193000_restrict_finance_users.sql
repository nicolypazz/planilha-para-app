-- Restringe a carteira financeira aos dois usuários autorizados da aplicação.
-- A autenticação continua sendo feita pelo Supabase; esta regra impede que
-- qualquer outra conta autenticada leia ou altere os dados financeiros.

create or replace function public.is_finance_user()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'nicolypaz4@gmail.com',
    '19natashacarvalho@gmail.com'
  );
$$;

alter table public.transactions enable row level security;
alter table public.installments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.categories enable row level security;
alter table public.responsible_users enable row level security;
alter table public.income_sources enable row level security;

drop policy if exists "authenticated access transactions" on public.transactions;
drop policy if exists "authenticated access installments" on public.installments;
drop policy if exists "authenticated access payment_methods" on public.payment_methods;
drop policy if exists "authenticated access categories" on public.categories;
drop policy if exists "authenticated access responsible_users" on public.responsible_users;
drop policy if exists "authenticated access income_sources" on public.income_sources;

drop policy if exists "finance users access transactions" on public.transactions;
create policy "finance users access transactions"
on public.transactions for all to authenticated
using (public.is_finance_user())
with check (public.is_finance_user());

drop policy if exists "finance users access installments" on public.installments;
create policy "finance users access installments"
on public.installments for all to authenticated
using (public.is_finance_user())
with check (public.is_finance_user());

drop policy if exists "finance users access payment_methods" on public.payment_methods;
create policy "finance users access payment_methods"
on public.payment_methods for all to authenticated
using (public.is_finance_user())
with check (public.is_finance_user());

drop policy if exists "finance users access categories" on public.categories;
create policy "finance users access categories"
on public.categories for all to authenticated
using (public.is_finance_user())
with check (public.is_finance_user());

drop policy if exists "finance users access responsible_users" on public.responsible_users;
create policy "finance users access responsible_users"
on public.responsible_users for all to authenticated
using (public.is_finance_user())
with check (public.is_finance_user());

drop policy if exists "finance users access income_sources" on public.income_sources;
create policy "finance users access income_sources"
on public.income_sources for all to authenticated
using (public.is_finance_user())
with check (public.is_finance_user());
