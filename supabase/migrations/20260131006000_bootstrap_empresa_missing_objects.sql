/*
  Fix: PROD reset (banco limpo) estava sem objetos base de multi-tenant

  Sintomas em PROD:
  - 404 em /rest/v1/empresa_usuarios
  - 404 em /rest/v1/user_active_empresa
  - 404 em /rest/v1/rpc/secure_bootstrap_empresa_for_current_user

  Este arquivo garante a existência de:
  - helper public.is_user_member_of(uuid)
  - tabela public.user_active_empresa + RLS
  - RPCs: set_active_empresa_for_current_user, bootstrap_empresa_for_current_user, secure_bootstrap_empresa_for_current_user
*/

BEGIN;

-- 1) Helper: membership check
create or replace function public.is_user_member_of(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.empresa_usuarios eu
    where eu.user_id = auth.uid()
      and eu.empresa_id = p_empresa_id
  );
$$;

revoke all on function public.is_user_member_of(uuid) from public, anon;
grant execute on function public.is_user_member_of(uuid) to authenticated, service_role, postgres;

-- 2) Persistência de empresa ativa por usuário
create table if not exists public.user_active_empresa (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_active_empresa_empresa
  on public.user_active_empresa (empresa_id);

drop trigger if exists tg_user_active_empresa_updated_at on public.user_active_empresa;
create trigger tg_user_active_empresa_updated_at
before update on public.user_active_empresa
for each row execute function public.tg_set_updated_at();

alter table public.user_active_empresa enable row level security;

drop policy if exists user_active_empresa_sel on public.user_active_empresa;
drop policy if exists user_active_empresa_ins on public.user_active_empresa;
drop policy if exists user_active_empresa_upd on public.user_active_empresa;
drop policy if exists user_active_empresa_del on public.user_active_empresa;

create policy user_active_empresa_sel
on public.user_active_empresa
for select
to authenticated
using (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

create policy user_active_empresa_ins
on public.user_active_empresa
for insert
to authenticated
with check (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

create policy user_active_empresa_upd
on public.user_active_empresa
for update
to authenticated
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
to authenticated
using (
  user_id = public.current_user_id()
  and public.is_user_member_of(empresa_id)
);

grant select, insert, update, delete on table public.user_active_empresa to authenticated, service_role, postgres;

-- 3) RPC: set/unset empresa ativa
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
end;
$$;

revoke all on function public.set_active_empresa_for_current_user(uuid) from public, anon;
grant execute on function public.set_active_empresa_for_current_user(uuid) to authenticated, service_role, postgres;

-- 4) RPC: bootstrap de empresa (idempotente)
-- Em alguns bancos antigos, essa função pode existir com um retorno diferente.
-- `CREATE OR REPLACE` não permite mudar o return type, então garantimos DROP antes.
drop function if exists public.secure_bootstrap_empresa_for_current_user(text, text);
drop function if exists public.secure_bootstrap_empresa_for_current_user(text);
drop function if exists public.secure_bootstrap_empresa_for_current_user();
drop function if exists public.bootstrap_empresa_for_current_user(text, text);
drop function if exists public.bootstrap_empresa_for_current_user(text);
drop function if exists public.bootstrap_empresa_for_current_user();

create or replace function public.bootstrap_empresa_for_current_user(
  p_razao_social text default null,
  p_fantasia text default null
)
returns table (empresa_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_owner_role_id uuid;
begin
  if v_uid is null then
    raise exception '[RPC][BOOTSTRAP_EMPRESA] Usuário não autenticado.' using errcode = '42501';
  end if;

  -- 1) Já existe empresa ativa
  select uae.empresa_id into v_emp
  from public.user_active_empresa uae
  where uae.user_id = v_uid;

  if v_emp is not null then
    return query select v_emp, 'already_active';
    return;
  end if;

  -- 2) Tem vínculo: ativa a mais recente
  select eu.empresa_id into v_emp
  from public.empresa_usuarios eu
  where eu.user_id = v_uid
  order by eu.created_at desc
  limit 1;

  if v_emp is not null then
    perform public.set_active_empresa_for_current_user(v_emp);
    return query select v_emp, 'activated_existing';
    return;
  end if;

  -- 3) Não tem vínculo: cria empresa + vínculo owner + ativa
  insert into public.empresas (nome, owner_id)
  values (coalesce(nullif(p_razao_social,''), nullif(p_fantasia,''), 'Empresa sem Nome'), v_uid)
  returning id into v_emp;

  select id into v_owner_role_id from public.roles where slug = 'OWNER';

  insert into public.empresa_usuarios (empresa_id, user_id, role, role_id)
  values (v_emp, v_uid, 'owner', v_owner_role_id)
  on conflict (empresa_id, user_id) do update set
    role = excluded.role,
    role_id = coalesce(excluded.role_id, public.empresa_usuarios.role_id);

  perform public.set_active_empresa_for_current_user(v_emp);
  return query select v_emp, 'created_new';
end;
$$;

revoke all on function public.bootstrap_empresa_for_current_user(text, text) from public, anon;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated, service_role, postgres;

-- 5) RPC compat: secure_bootstrap_* (frontend usa no Callback)
create or replace function public.secure_bootstrap_empresa_for_current_user(
  p_razao_social text default null,
  p_fantasia text default null
)
returns table (empresa_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
    select * from public.bootstrap_empresa_for_current_user(p_razao_social, p_fantasia);
end;
$$;

revoke all on function public.secure_bootstrap_empresa_for_current_user(text, text) from public, anon;
grant execute on function public.secure_bootstrap_empresa_for_current_user(text, text) to authenticated, service_role, postgres;

-- 6) Garantir leitura (PostgREST) para authenticated
grant select on table public.empresa_usuarios to authenticated, service_role, postgres;
grant select on table public.empresas to authenticated, service_role, postgres;

select pg_notify('pgrst','reload schema');

COMMIT;
