-- Migration: Dashboard Shortcuts
-- Allows users to customize their quick action shortcuts per empresa/user

begin;

-- 1. Table for storing user shortcuts
create table if not exists public.dashboard_shortcuts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shortcut_ids text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(empresa_id, user_id)
);

-- 2. RLS
alter table public.dashboard_shortcuts enable row level security;

create policy "shortcuts_own" on public.dashboard_shortcuts
  for all to authenticated
  using (user_id = public.current_user_id() and empresa_id = public.current_empresa_id())
  with check (user_id = public.current_user_id() and empresa_id = public.current_empresa_id());

-- 3. RPC: Get shortcuts for current user/empresa
create or replace function public.dashboard_shortcuts_get()
returns text[]
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select shortcut_ids from public.dashboard_shortcuts 
     where user_id = public.current_user_id() and empresa_id = public.current_empresa_id()),
    '{}'::text[]
  );
$$;

-- 4. RPC: Set shortcuts for current user/empresa
create or replace function public.dashboard_shortcuts_set(p_ids text[])
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := public.current_user_id();
begin
  if v_empresa is null or v_user is null then
    raise exception 'Sessão inválida';
  end if;

  insert into public.dashboard_shortcuts (empresa_id, user_id, shortcut_ids)
  values (v_empresa, v_user, p_ids)
  on conflict (empresa_id, user_id)
  do update set shortcut_ids = p_ids, updated_at = now();
end;
$$;

-- 5. Grants
grant select, insert, update, delete on public.dashboard_shortcuts to authenticated;
grant execute on function public.dashboard_shortcuts_get() to authenticated;
grant execute on function public.dashboard_shortcuts_set(text[]) to authenticated;

commit;
