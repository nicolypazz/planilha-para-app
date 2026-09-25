-- Persistência compartilhada no Supabase/Lovable Cloud.
-- O aplicativo já grava transactions/installments e tabelas de configuração
-- diretamente no Supabase; esta migração garante RLS para usuários autenticados.
-- O modelo atual é de uma carteira compartilhada: qualquer sessão autenticada
-- da aplicação pode ler/escrever os dados da carteira.

alter table public.transactions enable row level security;
alter table public.installments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.categories enable row level security;
alter table public.responsible_users enable row level security;
alter table public.income_sources enable row level security;

drop policy if exists "authenticated access transactions" on public.transactions;
create policy "authenticated access transactions"
on public.transactions for all to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "authenticated access installments" on public.installments;
create policy "authenticated access installments"
on public.installments for all to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "authenticated access payment_methods" on public.payment_methods;
create policy "authenticated access payment_methods"
on public.payment_methods for all to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "authenticated access categories" on public.categories;
create policy "authenticated access categories"
on public.categories for all to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "authenticated access responsible_users" on public.responsible_users;
create policy "authenticated access responsible_users"
on public.responsible_users for all to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "authenticated access income_sources" on public.income_sources;
create policy "authenticated access income_sources"
on public.income_sources for all to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);
