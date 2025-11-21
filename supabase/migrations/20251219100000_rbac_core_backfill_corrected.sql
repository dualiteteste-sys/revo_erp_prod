/*
          # [Operation Name]
          RBAC Core + Backfill (corrigido)
          ## Query Description: ["This script establishes the core tables for Role-Based Access Control (roles, permissions, role_permissions, user_permission_overrides), adds the `role_id` column to `empresa_usuarios`, backfills it from the legacy `role` text column, and creates essential utility functions (`current_role_id`, `has_permission_for_current_user`, `ensure_company_has_owner`). It follows strict security and idempotency patterns, including `SECURITY DEFINER` on functions and `IF NOT EXISTS` clauses."]
          ## Metadata:
          - Schema-Category: ["Structural"]
          - Impact-Level: ["Medium"]
          - Requires-Backup: [false]
          - Reversible: [false]
          ## Structure Details:
          - Tables Created: `public.roles`, `public.permissions`, `public.role_permissions`, `public.user_permission_overrides`
          - Columns Added: `public.empresa_usuarios.role_id`
          - Functions Created: `tg_set_updated_at`, `current_role_id`, `has_permission_for_current_user`, `ensure_company_has_owner`
          - Data Migrated: Backfills `empresa_usuarios.role_id` from the old `role` column.
          ## Security Implications:
          - RLS Status: [Not directly modified, but provides foundation for RLS]
          - Policy Changes: [No]
          - Auth Requirements: [Functions are `SECURITY DEFINER` and rely on JWT claims via helper functions.]
          ## Performance Impact:
          - Indexes: [Added indexes on foreign keys and for common query patterns on RBAC tables and `empresa_usuarios`.]
          - Triggers: [Added `updated_at` triggers to all new RBAC tables.]
          - Estimated Impact: [Low to Medium. Adds new tables and indexes which might slightly affect write performance but will improve read performance for permission checks.]
          */
-- =====================================================================
-- RBAC Core + Backfill (corrigido): roles, permissions, role_permissions,
-- overrides e vínculo em empresa_usuarios (role_id) com migração de role (text)
-- Padrões: SD + search_path fixo | idempotente | UUID | índices essenciais
-- =====================================================================

-- 0) Extensões necessárias
create extension if not exists pgcrypto;

-- 1) Util: função de trigger updated_at (garantia)
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='tg_set_updated_at'
  ) then
    create or replace function public.tg_set_updated_at()
    returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog, public
    as $fn$
    begin
      new.updated_at := now();
      return new;
    end;
    $fn$;

    revoke all on function public.tg_set_updated_at() from public;
    grant execute on function public.tg_set_updated_at() to authenticated, service_role;
  end if;
end$$;

-- 2) Tabelas de catálogo RBAC
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,         -- 'OWNER','ADMIN','FINANCE','OPS','READONLY'
  name text not null,
  precedence int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,              -- ex: 'usuarios','contas_a_receber','centros_de_custo','produtos','servicos','logs','roles'
  action text not null,              -- 'view','create','update','delete','manage'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_permissions unique (module, action),
  constraint ck_action check (action in ('view','create','update','delete','manage'))
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allow boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_permission_overrides (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allow boolean not null, -- true permite, false nega
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, user_id, permission_id)
);

-- 3) Índices
create index if not exists idx_role_permissions__role on public.role_permissions(role_id);
create index if not exists idx_role_permissions__perm on public.role_permissions(permission_id);
create index if not exists idx_upo__empresa_user on public.user_permission_overrides(empresa_id, user_id);

-- 4) Triggers updated_at nas tabelas RBAC
drop trigger if exists tg_roles_updated on public.roles;
create trigger tg_roles_updated
  before update on public.roles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_permissions_updated on public.permissions;
create trigger tg_permissions_updated
  before update on public.permissions
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_role_permissions_updated on public.role_permissions;
create trigger tg_role_permissions_updated
  before update on public.role_permissions
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_upo_updated on public.user_permission_overrides;
create trigger tg_upo_updated
  before update on public.user_permission_overrides
  for each row execute function public.tg_set_updated_at();

-- 5) Vínculo em empresa_usuarios: adicionar role_id (preserva coluna role TEXT)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='empresa_usuarios' and column_name='role_id'
  ) then
    alter table public.empresa_usuarios
      add column role_id uuid null references public.roles(id) on delete set null;
  end if;
end$$;

-- Índice auxiliar: empresa + role_id
create index if not exists idx_empresa_usuarios__empresa_role on public.empresa_usuarios(empresa_id, role_id);

-- Índice para listagens por created_at (substitui versão por updated_at)
drop index if exists idx_empresa_usuarios__empresa_updated_at;
create index if not exists idx_empresa_usuarios__empresa_created_at
on public.empresa_usuarios(empresa_id, created_at desc);

-- 6) Seeds de papéis
insert into public.roles (slug, name, precedence) values
  ('OWNER','Proprietário',0),
  ('ADMIN','Administrador',10),
  ('FINANCE','Financeiro',20),
  ('OPS','Operações',30),
  ('READONLY','Leitura',100)
on conflict (slug) do update set name=excluded.name, precedence=excluded.precedence;

-- 7) Seeds de permissões (módulos principais + roles)
insert into public.permissions(module, action) values
  ('usuarios','view'),('usuarios','create'),('usuarios','update'),('usuarios','delete'),('usuarios','manage'),
  ('roles','view'),('roles','create'),('roles','update'),('roles','delete'),('roles','manage'),
  ('contas_a_receber','view'),('contas_a_receber','create'),('contas_a_receber','update'),('contas_a_receber','delete'),
  ('centros_de_custo','view'),('centros_de_custo','create'),('centros_de_custo','update'),('centros_de_custo','delete'),
  ('produtos','view'),('produtos','create'),('produtos','update'),('produtos','delete'),
  ('servicos','view'),('servicos','create'),('servicos','update'),('servicos','delete'),
  ('logs','view')
on conflict (module, action) do nothing;

-- 8) Política default por papel
-- OWNER: tudo
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r join public.permissions p on true
where r.slug='OWNER'
on conflict do nothing;

-- ADMIN: tudo (mantemos flexibilidade p/ futuras restrições finas)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r join public.permissions p on true
where r.slug='ADMIN'
on conflict do nothing;

-- FINANCE: financeiro + centros de custo (sem delete), leitura básica de usuários + logs
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r join public.permissions p
  on ( (p.module='contas_a_receber' and p.action in ('view','create','update'))
    or (p.module='centros_de_custo' and p.action in ('view','create','update'))
    or (p.module in ('produtos','servicos') and p.action='view')
    or (p.module='usuarios' and p.action='view')
    or (p.module='roles' and p.action='view')
    or (p.module='logs' and p.action='view') )
where r.slug='FINANCE'
on conflict do nothing;

-- OPS: operações (sem delete), sem gestão de usuários
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r join public.permissions p
  on ( (p.module in ('produtos','servicos') and p.action in ('view','create','update'))
    or (p.module='centros_de_custo' and p.action in ('view','create','update'))
    or (p.module='logs' and p.action='view') )
where r.slug='OPS'
on conflict do nothing;

-- READONLY: somente leitura nos módulos operacionais e logs
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r join public.permissions p
  on ( (p.module in ('contas_a_receber','centros_de_custo','produtos','servicos') and p.action='view')
    or (p.module='logs' and p.action='view') )
where r.slug='READONLY'
on conflict do nothing;

-- 9) BACKFILL: empresa_usuarios.role (TEXT) -> role_id (UUID)
-- Mapeia slugs conhecidos (case-insensitive). Mantém coluna role TEXT por compatibilidade.
with rmap as (
  select slug, id from public.roles
)
update public.empresa_usuarios eu
set role_id = r.id
from rmap r
where eu.role_id is null
  and eu.role is not null
  and upper(eu.role) = r.slug;

-- 10) Funções utilitárias RBAC
-- 10.1) Papel efetivo do usuário atual (empresa atual) por created_at
create or replace function public.current_role_id()
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select eu.role_id
  from public.empresa_usuarios eu
  where eu.user_id = public.current_user_id()
    and eu.empresa_id = public.current_empresa_id()
  order by eu.created_at desc nulls last
  limit 1
$$;
revoke all on function public.current_role_id() from public;
grant execute on function public.current_role_id() to authenticated, service_role;

-- 10.2) Checagem de permissão efetiva (override > papel)
create or replace function public.has_permission_for_current_user(p_module text, p_action text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();
  v_role uuid := public.current_role_id();
  v_perm uuid;
  v_override boolean;
  v_allowed boolean;
begin
  if v_emp is null or v_uid is null then
    return false;
  end if;

  select id into v_perm
  from public.permissions
  where module = p_module and action = p_action
  limit 1;

  if v_perm is null then
    return false;
  end if;

  select u.allow into v_override
  from public.user_permission_overrides u
  where u.empresa_id = v_emp and u.user_id = v_uid and u.permission_id = v_perm;

  if v_override is not null then
    return v_override;
  end if;

  if v_role is null then
    return false;
  end if;

  select rp.allow into v_allowed
  from public.role_permissions rp
  where rp.role_id = v_role and rp.permission_id = v_perm;

  return coalesce(v_allowed, false);
end
$$;
revoke all on function public.has_permission_for_current_user(text,text) from public;
grant execute on function public.has_permission_for_current_user(text,text) to authenticated, service_role;

-- 10.3) Garantia lógica: >=1 OWNER por empresa
create or replace function public.ensure_company_has_owner(p_empresa_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_role uuid;
  v_cnt int;
begin
  select id into v_owner_role from public.roles where slug='OWNER';
  if v_owner_role is null then
    return false;
  end if;

  select count(*) into v_cnt
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa_id and eu.role_id = v_owner_role;

  return v_cnt >= 1;
end
$$;
revoke all on function public.ensure_company_has_owner(uuid) from public;
grant execute on function public.ensure_company_has_owner(uuid) to authenticated, service_role;

-- 11) PostgREST: recarregar schema
select pg_notify('pgrst','reload schema');
