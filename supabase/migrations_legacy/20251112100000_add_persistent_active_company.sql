-- [MIGRATION] Empresa ativa persistente por usuário (sem depender de sessão)

-- 1) Tabela de estado por usuário
create table if not exists public.user_active_empresa (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- 1.1) Índice auxiliar
create index if not exists idx_user_active_empresa_empresa on public.user_active_empresa (empresa_id);

-- 1.2) Trigger updated_at
drop trigger if exists tg_user_active_empresa_updated_at on public.user_active_empresa;
create trigger tg_user_active_empresa_updated_at
before update on public.user_active_empresa
for each row execute function public.tg_set_updated_at();

-- 1.3) RLS por operação
alter table public.user_active_empresa enable row level security;

drop policy if exists user_active_empresa_sel on public.user_active_empresa;
drop policy if exists user_active_empresa_ins on public.user_active_empresa;
drop policy if exists user_active_empresa_upd on public.user_active_empresa;
drop policy if exists user_active_empresa_del on public.user_active_empresa;

create policy user_active_empresa_sel
on public.user_active_empresa
for select
using (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

create policy user_active_empresa_ins
on public.user_active_empresa
for insert
with check (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

create policy user_active_empresa_upd
on public.user_active_empresa
for update
using (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
)
with check (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

create policy user_active_empresa_del
on public.user_active_empresa
for delete
using (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

-- 2) RPC: define/limpa empresa ativa do usuário atual
create or replace function public.set_active_empresa_for_current_user(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_empresa_id is null then
    delete from public.user_active_empresa where user_id = v_user_id;
    return;
  end if;

  if not public.is_user_member_of(p_empresa_id) then
    raise exception 'Acesso negado a esta empresa.' using errcode = '42501';
  end if;

  insert into public.user_active_empresa (user_id, empresa_id)
  values (v_user_id, p_empresa_id)
  on conflict (user_id) do update set
    empresa_id = excluded.empresa_id,
    updated_at = now();

  perform pg_notify('app_log', '[RPC] [SET_ACTIVE_EMPRESA] '||v_user_id::text||'→'||p_empresa_id::text);
end;
$$;

revoke all on function public.set_active_empresa_for_current_user(uuid) from public, anon;
grant  execute on function public.set_active_empresa_for_current_user(uuid) to authenticated, service_role, postgres;

-- 3) current_empresa_id() prioriza a preferência; fallback: 1 vínculo exato
create or replace function public.current_empresa_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_emp uuid;
begin
  if v_user_id is null then
    return null;
  end if;

  -- a) preferência persistida
  select u.empresa_id into v_emp
  from public.user_active_empresa u
  where u.user_id = v_user_id;

  if v_emp is not null then
    return v_emp;
  end if;

  -- b) fallback: exatamente 1 empresa vinculada
  select eu.empresa_id into v_emp
  from public.empresa_usuarios eu
  where eu.user_id = v_user_id;
  
  if found and (select count(*) from public.empresa_usuarios where user_id = v_user_id) = 1 then
    return v_emp;
  end if;

  return null; -- pode ser null (sem vínculo ou com múltiplos sem preferência)
end;
$$;

-- 4) (Opcional) manter a antiga set_active_empresa baseada em GUC removida
drop function if exists public.set_active_empresa(uuid);
