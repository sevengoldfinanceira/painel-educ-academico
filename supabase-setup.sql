create table if not exists public.crm_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.crm_state enable row level security;

drop policy if exists "Usuario visualiza seu CRM" on public.crm_state;
create policy "Usuario visualiza seu CRM"
on public.crm_state for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Usuario cria seu CRM" on public.crm_state;
create policy "Usuario cria seu CRM"
on public.crm_state for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Usuario atualiza seu CRM" on public.crm_state;
create policy "Usuario atualiza seu CRM"
on public.crm_state for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.crm_sales (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.crm_sales enable row level security;

drop policy if exists "Usuario visualiza suas vendas" on public.crm_sales;
create policy "Usuario visualiza suas vendas"
on public.crm_sales for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Usuario cria suas vendas" on public.crm_sales;
create policy "Usuario cria suas vendas"
on public.crm_sales for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Usuario atualiza suas vendas" on public.crm_sales;
create policy "Usuario atualiza suas vendas"
on public.crm_sales for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Usuario exclui suas vendas" on public.crm_sales;
create policy "Usuario exclui suas vendas"
on public.crm_sales for delete to authenticated
using (auth.uid() = user_id);
