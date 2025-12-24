/*
  RBAC core (foundation)

  - Creates: roles, permissions, role_permissions, user_permission_overrides
  - Adds: empresa_usuarios.role_id (if missing) + backfill from role (text)
  - Functions: current_role_id, has_permission_for_current_user, ensure_company_has_owner
  - RLS: read for authenticated; write on role_permissions/overrides only for admin/owner
*/

BEGIN;

create extension if not exists pgcrypto;

-- 1) Tables
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- OWNER, ADMIN, MEMBER, VIEWER...
  name text not null,
  precedence int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_unique unique (module, action),
  constraint permissions_action_chk check (action in ('view','create','update','delete','manage'))
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
  allow boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, user_id, permission_id)
);

create index if not exists idx_role_permissions__role on public.role_permissions(role_id);
create index if not exists idx_role_permissions__perm on public.role_permissions(permission_id);
create index if not exists idx_upo__empresa_user on public.user_permission_overrides(empresa_id, user_id);

-- 2) Triggers updated_at
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

-- 3) Link empresa_usuarios.role_id (compat com role text)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='empresa_usuarios'
      and column_name='role_id'
  ) then
    alter table public.empresa_usuarios
      add column role_id uuid null references public.roles(id) on delete set null;
  end if;
end$$;

create index if not exists idx_empresa_usuarios__empresa_role
  on public.empresa_usuarios(empresa_id, role_id);

-- 4) Seeds (roles)
insert into public.roles (slug, name, precedence) values
  ('OWNER','Proprietario',0),
  ('ADMIN','Administrador',10),
  ('MEMBER','Membro',20),
  ('OPS','Operacoes',30),
  ('FINANCE','Financeiro',40),
  ('VIEWER','Leitura',100)
on conflict (slug) do update
  set name = excluded.name,
      precedence = excluded.precedence;

-- 5) Seeds (permissions)
insert into public.permissions(module, action) values
  ('usuarios','view'),('usuarios','create'),('usuarios','update'),('usuarios','delete'),('usuarios','manage'),
  ('roles','view'),('roles','create'),('roles','update'),('roles','delete'),('roles','manage'),
  ('contas_a_receber','view'),('contas_a_receber','create'),('contas_a_receber','update'),('contas_a_receber','delete'),
  ('centros_de_custo','view'),('centros_de_custo','create'),('centros_de_custo','update'),('centros_de_custo','delete'),
  ('produtos','view'),('produtos','create'),('produtos','update'),('produtos','delete'),
  ('servicos','view'),('servicos','create'),('servicos','update'),('servicos','delete'),
  ('logs','view')
on conflict (module, action) do nothing;

-- 6) Seeds (role_permissions)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on true
where r.slug in ('OWNER','ADMIN')
on conflict do nothing;

-- MEMBER: operacoes basicas (sem gestao de usuarios/roles)
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on (
    (p.module in ('produtos','servicos') and p.action in ('view','create','update','delete'))
    or (p.module='centros_de_custo' and p.action in ('view','create','update'))
    or (p.module='contas_a_receber' and p.action in ('view'))
    or (p.module='logs' and p.action='view')
  )
where r.slug = 'MEMBER'
on conflict do nothing;

-- OPS
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on (
    (p.module in ('produtos','servicos') and p.action in ('view','create','update'))
    or (p.module='centros_de_custo' and p.action in ('view','create','update'))
    or (p.module='logs' and p.action='view')
  )
where r.slug = 'OPS'
on conflict do nothing;

-- FINANCE
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on (
    (p.module='contas_a_receber' and p.action in ('view','create','update'))
    or (p.module='centros_de_custo' and p.action in ('view','create','update'))
    or (p.module in ('produtos','servicos') and p.action='view')
    or (p.module='usuarios' and p.action='view')
    or (p.module='roles' and p.action='view')
    or (p.module='logs' and p.action='view')
  )
where r.slug = 'FINANCE'
on conflict do nothing;

-- VIEWER
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on (
    (p.module in ('contas_a_receber','centros_de_custo','produtos','servicos') and p.action='view')
    or (p.module='logs' and p.action='view')
  )
where r.slug = 'VIEWER'
on conflict do nothing;

-- 7) Backfill empresa_usuarios.role_id from role text
with rmap as (
  select slug, id from public.roles
)
update public.empresa_usuarios eu
set role_id = r.id
from rmap r
where eu.role_id is null
  and eu.role is not null
  and upper(eu.role) = r.slug;

-- 8) Functions
create or replace function public.current_role_id()
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select coalesce(eu.role_id, r.id)
  from public.empresa_usuarios eu
  left join public.roles r on upper(r.slug) = upper(eu.role)
  where eu.user_id = public.current_user_id()
    and eu.empresa_id = public.current_empresa_id()
  order by eu.created_at desc nulls last
  limit 1
$$;
revoke all on function public.current_role_id() from public;
grant execute on function public.current_role_id() to authenticated, service_role;

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
  if public.is_service_role() then
    return true;
  end if;

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
  where u.empresa_id = v_emp
    and u.user_id = v_uid
    and u.permission_id = v_perm;

  if v_override is not null then
    return v_override;
  end if;

  if public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin') then
    return true;
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
  select id into v_owner_role from public.roles where slug = 'OWNER';
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

-- 9) RLS (read for authenticated; admin/owner can edit mappings)
alter table public.roles enable row level security;
drop policy if exists roles_select_authenticated on public.roles;
create policy roles_select_authenticated
  on public.roles
  for select
  to authenticated
  using (true);

alter table public.permissions enable row level security;
drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated
  on public.permissions
  for select
  to authenticated
  using (true);

alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select_authenticated on public.role_permissions;
create policy role_permissions_select_authenticated
  on public.role_permissions
  for select
  to authenticated
  using (true);

drop policy if exists role_permissions_insert_admin on public.role_permissions;
create policy role_permissions_insert_admin
  on public.role_permissions
  for insert
  to authenticated
  with check (public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin'));

drop policy if exists role_permissions_update_admin on public.role_permissions;
create policy role_permissions_update_admin
  on public.role_permissions
  for update
  to authenticated
  using (public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin'))
  with check (public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin'));

drop policy if exists role_permissions_delete_admin on public.role_permissions;
create policy role_permissions_delete_admin
  on public.role_permissions
  for delete
  to authenticated
  using (public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin'));

alter table public.user_permission_overrides enable row level security;
drop policy if exists user_permission_overrides_select_authenticated on public.user_permission_overrides;
create policy user_permission_overrides_select_authenticated
  on public.user_permission_overrides
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists user_permission_overrides_insert_admin on public.user_permission_overrides;
create policy user_permission_overrides_insert_admin
  on public.user_permission_overrides
  for insert
  to authenticated
  with check (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

drop policy if exists user_permission_overrides_update_admin on public.user_permission_overrides;
create policy user_permission_overrides_update_admin
  on public.user_permission_overrides
  for update
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

drop policy if exists user_permission_overrides_delete_admin on public.user_permission_overrides;
create policy user_permission_overrides_delete_admin
  on public.user_permission_overrides
  for delete
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

grant select on table public.roles, public.permissions, public.role_permissions, public.user_permission_overrides
  to authenticated;
grant all on table public.roles, public.permissions, public.role_permissions, public.user_permission_overrides
  to service_role;

select pg_notify('pgrst','reload schema');

COMMIT;
