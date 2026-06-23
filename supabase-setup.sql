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

-- Tabela de perfis de usuario para controle de acesso (RBAC)
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- Funcao security definer para verificar admin sem recursao RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Conceder acesso para authenticated users usarem a funcao
grant execute on function public.is_admin to authenticated;

-- Funcao para contar admins (se = 0, o primeiro usuario a logar vira admin)
create or replace function public.get_admin_count()
returns bigint
language sql
security definer
stable
as $$
  select count(*) from public.user_profiles where role = 'admin';
$$;

grant execute on function public.get_admin_count to authenticated;

-- Usuario ve seu proprio perfil; admin ve todos
drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select"
  on public.user_profiles for select to authenticated
  using (
    auth.uid() = id
    or public.is_admin()
  );

-- Usuario cria apenas seu proprio perfil (primeiro login)
drop policy if exists "user_profiles_insert" on public.user_profiles;
create policy "user_profiles_insert"
  on public.user_profiles for insert to authenticated
  with check (auth.uid() = id);

-- Usuario altera seu proprio; admin altera qualquer um
drop policy if exists "user_profiles_update" on public.user_profiles;
create policy "user_profiles_update"
  on public.user_profiles for update to authenticated
  using (
    auth.uid() = id
    or public.is_admin()
  )
  with check (
    auth.uid() = id
    or public.is_admin()
  );

-- Funcao para admin criar usuario direto no auth (sem email, sem rate limit)
create or replace function public.admin_create_user(user_email text, user_password text)
returns uuid
language plpgsql
security definer
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  new_id := gen_random_uuid();
  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at,
    confirmation_sent_at, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, instance_id, aud, role
  ) values (
    new_id, user_email,
    crypt(user_password, gen_salt('bf')),
    now(), now(), '', '',
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  );
  insert into auth.identities (
    id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    new_id, new_id,
    jsonb_build_object('sub', new_id::text, 'email', user_email),
    'email', now(), now(), now()
  );
  return new_id;
end;
$$;

grant execute on function public.admin_create_user to authenticated;

-- Funcao para admin deletar usuario COMPLETAMENTE (auth + dados)
create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  delete from auth.users where id = target_id;
end;
$$;

grant execute on function public.admin_delete_user to authenticated;

-- Admin tambem pode deletar usuarios
drop policy if exists "user_profiles_delete" on public.user_profiles;
create policy "user_profiles_delete"
  on public.user_profiles for delete to authenticated
  using (public.is_admin());
