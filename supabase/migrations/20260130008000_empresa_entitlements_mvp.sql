/*
  Entitlements MVP (Planos/Limites) por empresa.

  Objetivo:
  - Permitir configurar qual "plano MVP" a empresa possui: servicos | industria | ambos
  - Expor no view empresa_features para uso no frontend (menus/guards)
  - Enforce básico no banco: limitar quantidade de usuários vinculados à empresa (empresa_usuarios)

  Importante:
  - Defaults NÃO bloqueiam nada (plano_mvp='ambos' e max_users=999 quando não configurado)
  - Configuração pode ser feita por admins/owners
*/

-- ============================================================================
-- 1) Tabela de entitlements por empresa
-- ============================================================================
create table if not exists public.empresa_entitlements (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  plano_mvp text not null default 'ambos',
  max_users integer not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_entitlements_plano_mvp_check check (plano_mvp in ('servicos', 'industria', 'ambos')),
  constraint empresa_entitlements_max_users_check check (max_users >= 1)
);

alter table public.empresa_entitlements enable row level security;

drop trigger if exists tg_empresa_entitlements_updated_at on public.empresa_entitlements;
create trigger tg_empresa_entitlements_updated_at
before update on public.empresa_entitlements
for each row
execute function public.tg_set_updated_at();

drop policy if exists "empresa_entitlements_select" on public.empresa_entitlements;
create policy "empresa_entitlements_select"
  on public.empresa_entitlements
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists "empresa_entitlements_admin_write" on public.empresa_entitlements;
create policy "empresa_entitlements_admin_write"
  on public.empresa_entitlements
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

grant select, insert, update, delete on table public.empresa_entitlements to authenticated, service_role;

-- ============================================================================
-- 2) Enforce de limite de usuários (empresa_usuarios)
-- ============================================================================
create or replace function public.enforce_empresa_max_users()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_max_users int;
  v_current_users int;
begin
  if public.is_service_role() then
    return new;
  end if;

  -- Default seguro: sem row configurada => não bloquear (999)
  select coalesce(
    (select ee.max_users from public.empresa_entitlements ee where ee.empresa_id = new.empresa_id),
    999
  )
  into v_max_users;

  select count(*) into v_current_users
  from public.empresa_usuarios eu
  where eu.empresa_id = new.empresa_id;

  if v_current_users >= v_max_users then
    raise exception
      'Limite de usuários atingido para esta empresa (%). Faça upgrade do plano ou ajuste o limite em Configurações.'
      , v_max_users
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_empresa_max_users() from public, anon;
grant execute on function public.enforce_empresa_max_users() to authenticated, service_role, postgres;

drop trigger if exists tg_empresa_usuarios_enforce_max_users on public.empresa_usuarios;
create trigger tg_empresa_usuarios_enforce_max_users
before insert on public.empresa_usuarios
for each row
execute function public.enforce_empresa_max_users();

-- ============================================================================
-- 3) View empresa_features: adiciona plano_mvp + max_users + módulos habilitados
-- ============================================================================
create or replace view public.empresa_features
with (security_invoker = true, security_barrier = true)
as
select
  e.id as empresa_id,
  exists (
    select 1
    from public.empresa_addons ea
    where ea.empresa_id = e.id
      and ea.addon_slug = 'REVO_SEND'
      and ea.status = any (array['active'::text, 'trialing'::text])
      and coalesce(ea.cancel_at_period_end, false) = false
  ) as revo_send_enabled,
  coalesce(ef.nfe_emissao_enabled, false) as nfe_emissao_enabled,
  coalesce(ent.plano_mvp, 'ambos') as plano_mvp,
  coalesce(ent.max_users, 999) as max_users,
  (coalesce(ent.plano_mvp, 'ambos') in ('servicos', 'ambos')) as servicos_enabled,
  (coalesce(ent.plano_mvp, 'ambos') in ('industria', 'ambos')) as industria_enabled
from public.empresas e
left join public.empresa_feature_flags ef
  on ef.empresa_id = e.id
left join public.empresa_entitlements ent
  on ent.empresa_id = e.id
where exists (
  select 1
  from public.empresa_usuarios eu
  where eu.empresa_id = e.id
    and eu.user_id = public.current_user_id()
);

grant select on public.empresa_features to authenticated;

select pg_notify('pgrst', 'reload schema');

