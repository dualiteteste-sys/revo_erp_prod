/*
  CFG hardening: Planos/Limites + Feature Flags

  Objetivo (CFG-02 / CFG-04):
  - Evitar bypass via console: aplicar "enforcement" no DB para módulos por plano (Serviços/Indústria).
  - Restringir quem pode alterar feature flags/configs (admin/owner).
  - Garantir auditoria (audit_logs) para mudanças em entitlements/flags/configs.

  Estratégia:
  - Criar políticas RLS *RESTRICTIVE* (AND) por módulo, sem reescrever todas as políticas existentes.
  - Manter defaults seguros:
    - Sem row em empresa_entitlements => plano_mvp = 'ambos' (não bloqueia)
    - Sem row em empresa_feature_flags => flags = false
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.plano_mvp_allows(p_feature text)
returns boolean
language sql
stable
as $$
  select
    case
      when public.is_service_role() then true
      when public.current_empresa_id() is null then false
      when lower(coalesce(p_feature,'')) = 'industria'
        then coalesce((select ee.plano_mvp from public.empresa_entitlements ee where ee.empresa_id = public.current_empresa_id()), 'ambos')
             in ('industria','ambos')
      when lower(coalesce(p_feature,'')) = 'servicos'
        then coalesce((select ee.plano_mvp from public.empresa_entitlements ee where ee.empresa_id = public.current_empresa_id()), 'ambos')
             in ('servicos','ambos')
      else true
    end;
$$;

revoke all on function public.plano_mvp_allows(text) from public, anon;
grant execute on function public.plano_mvp_allows(text) to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- RLS: Feature flags e configs devem ser mutáveis só por admin/owner
-- ---------------------------------------------------------------------------

-- empresa_feature_flags
alter table if exists public.empresa_feature_flags enable row level security;

drop policy if exists "Enable all access" on public.empresa_feature_flags;
drop policy if exists empresa_feature_flags_select on public.empresa_feature_flags;
drop policy if exists empresa_feature_flags_admin_write on public.empresa_feature_flags;

create policy empresa_feature_flags_select
  on public.empresa_feature_flags
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy empresa_feature_flags_admin_write
  on public.empresa_feature_flags
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

grant select on table public.empresa_feature_flags to authenticated, service_role;
grant insert, update, delete on table public.empresa_feature_flags to authenticated, service_role;

-- fiscal_nfe_emissao_configs
alter table if exists public.fiscal_nfe_emissao_configs enable row level security;

drop policy if exists "Enable all access" on public.fiscal_nfe_emissao_configs;
drop policy if exists fiscal_nfe_emissao_configs_select on public.fiscal_nfe_emissao_configs;
drop policy if exists fiscal_nfe_emissao_configs_admin_write on public.fiscal_nfe_emissao_configs;

create policy fiscal_nfe_emissao_configs_select
  on public.fiscal_nfe_emissao_configs
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy fiscal_nfe_emissao_configs_admin_write
  on public.fiscal_nfe_emissao_configs
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

grant select on table public.fiscal_nfe_emissao_configs to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_emissao_configs to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: Enforcement por plano (DB) usando policies RESTRICTIVE
-- ---------------------------------------------------------------------------

do $$
declare
  v_restr text;
  v_roles text;
  r record;
  p record;
begin
  -- Indústria: reescreve policies existentes adicionando AND plano_mvp_allows('industria')
  for r in
    select c.relname as tab
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname ~ '^industria_'
  loop
    v_restr := format('public.plano_mvp_allows(%L)', 'industria');
    for p in
      select policyname, cmd, qual, with_check, roles
      from pg_policies
      where schemaname = 'public' and tablename = r.tab
    loop
      select
        case
          when p.roles is null or array_length(p.roles, 1) is null then 'public'
          when 'public' = any(p.roles) then 'public'
          else (
            select string_agg(quote_ident(x), ', ')
            from unnest(p.roles) x
          )
        end
      into v_roles;

      execute format('drop policy if exists %I on public.%I', p.policyname, r.tab);

      if p.cmd = 'INSERT' then
        execute format(
          'create policy %I on public.%I for insert to %s with check ((%s) and (%s))',
          p.policyname,
          r.tab,
          v_roles,
          coalesce(p.with_check, p.qual, 'true'),
          v_restr
        );
      else
        execute format(
          'create policy %I on public.%I for %s to %s using ((%s) and (%s))%s',
          p.policyname,
          r.tab,
          lower(p.cmd),
          v_roles,
          coalesce(p.qual, 'true'),
          v_restr,
          case
            when p.cmd in ('UPDATE','ALL') then format(' with check ((%s) and (%s))', coalesce(p.with_check, p.qual, 'true'), v_restr)
            else ''
          end
        );
      end if;
    end loop;
  end loop;

  -- Serviços: reescreve policies existentes adicionando AND plano_mvp_allows('servicos')
  for r in
    select c.relname as tab
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (
        c.relname = 'servicos'
        or c.relname ~ '^ordem_serv'
        or c.relname ~ '^os_'
      )
  loop
    v_restr := format('public.plano_mvp_allows(%L)', 'servicos');
    for p in
      select policyname, cmd, qual, with_check, roles
      from pg_policies
      where schemaname = 'public' and tablename = r.tab
    loop
      select
        case
          when p.roles is null or array_length(p.roles, 1) is null then 'public'
          when 'public' = any(p.roles) then 'public'
          else (
            select string_agg(quote_ident(x), ', ')
            from unnest(p.roles) x
          )
        end
      into v_roles;

      execute format('drop policy if exists %I on public.%I', p.policyname, r.tab);

      if p.cmd = 'INSERT' then
        execute format(
          'create policy %I on public.%I for insert to %s with check ((%s) and (%s))',
          p.policyname,
          r.tab,
          v_roles,
          coalesce(p.with_check, p.qual, 'true'),
          v_restr
        );
      else
        execute format(
          'create policy %I on public.%I for %s to %s using ((%s) and (%s))%s',
          p.policyname,
          r.tab,
          lower(p.cmd),
          v_roles,
          coalesce(p.qual, 'true'),
          v_restr,
          case
            when p.cmd in ('UPDATE','ALL') then format(' with check ((%s) and (%s))', coalesce(p.with_check, p.qual, 'true'), v_restr)
            else ''
          end
        );
      end if;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auditoria: logar alterações em entitlements/flags/configs (quando audit existir)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.audit_logs') is null or to_regclass('public.process_audit_log') is null then
    return;
  end if;

  if to_regclass('public.empresa_entitlements') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.empresa_entitlements';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.empresa_entitlements for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.empresa_feature_flags') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.empresa_feature_flags';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.empresa_feature_flags for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.fiscal_nfe_emissao_configs') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.fiscal_nfe_emissao_configs';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.fiscal_nfe_emissao_configs for each row execute function public.process_audit_log()';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

COMMIT;
