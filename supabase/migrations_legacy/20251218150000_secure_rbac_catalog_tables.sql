/*
# [SECURITY FIX] RLS em tabelas de catálogo RBAC (roles/permissions/role_permissions)
- Ativa e FORÇA RLS nas três tabelas
- Concede apenas SELECT para authenticated
- Cria políticas idempotentes de SELECT (USING true)
- Sem DML para authenticated/public
*/

-- 0) Garantias de extensão
create extension if not exists pgcrypto;

-- 1) ROLES
alter table public.roles enable row level security;
alter table public.roles force row level security;

-- Revoga privilégios amplos e concede apenas o necessário
revoke all on table public.roles from public;
revoke all on table public.roles from authenticated;
grant select on table public.roles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='roles' and policyname='roles_select_any_for_authenticated'
  ) then
    execute $p$
      create policy roles_select_any_for_authenticated
      on public.roles
      for select to authenticated
      using (true);
    $p$;
  end if;
end
$$;

-- 2) PERMISSIONS
alter table public.permissions enable row level security;
alter table public.permissions force row level security;

revoke all on table public.permissions from public;
revoke all on table public.permissions from authenticated;
grant select on table public.permissions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='permissions' and policyname='permissions_select_any_for_authenticated'
  ) then
    execute $p$
      create policy permissions_select_any_for_authenticated
      on public.permissions
      for select to authenticated
      using (true);
    $p$;
  end if;
end
$$;

-- 3) ROLE_PERMISSIONS
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;

revoke all on table public.role_permissions from public;
revoke all on table public.role_permissions from authenticated;
grant select on table public.role_permissions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='role_permissions' and policyname='role_permissions_select_any_for_authenticated'
  ) then
    execute $p$
      create policy role_permissions_select_any_for_authenticated
      on public.role_permissions
      for select to authenticated
      using (true);
    $p$;
  end if;
end
$$;

-- 4) Opcional: garantir que o papel de automação (service_role) tenha DML (sem abrir para authenticated)
grant select, insert, update, delete on table public.roles             to service_role;
grant select, insert, update, delete on table public.permissions       to service_role;
grant select, insert, update, delete on table public.role_permissions  to service_role;

-- 5) Recarregar schema do PostgREST
select pg_notify('pgrst','reload schema');
