/*
  ADM-STA-03/04 — Multiunidade/Filiais (base) + Auditoria administrativa

  Motivo
  - Multiunidade habilita operações com filiais/unidades (base para emissão, estoque, PDV e financeiro por unidade).
  - Auditoria administrativa reduz suporte e risco: "quem mudou o quê e quando" em configurações críticas.

  O que muda
  - Cria `public.empresa_unidades` e `public.user_active_unidade` (preferência do usuário).
  - Adiciona RPCs para listar/criar/editar/excluir unidades e definir unidade ativa.
  - Ativa `audit_logs_trigger` (se existir) em tabelas administrativas para trilha confiável.
  - Seeda permissões RBAC: `unidades:view/manage`.

  Impacto
  - Sem impacto em fluxos existentes: nenhum módulo passa a depender da unidade ainda.
  - A auditoria apenas registra mudanças (best-effort).

  Reversibilidade
  - Reverter = dropar tabelas/RPCs e remover triggers adicionados.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- RBAC: permissões de unidades
-- -----------------------------------------------------------------------------
insert into public.permissions(module, action) values
  ('unidades','view'),
  ('unidades','manage')
on conflict (module, action) do nothing;

-- OWNER/ADMIN: tudo liberado
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module = 'unidades'
where r.slug in ('OWNER','ADMIN')
on conflict do nothing;

-- Demais: view
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module = 'unidades' and p.action = 'view'
where r.slug in ('MEMBER','OPS','FINANCE','VIEWER')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Tabela: unidades/filiais por empresa
-- -----------------------------------------------------------------------------
create table if not exists public.empresa_unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  codigo text null,
  ativo boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_unidades_nome_unique unique (empresa_id, nome)
);

create index if not exists idx_empresa_unidades_empresa on public.empresa_unidades(empresa_id, ativo, nome);

alter table public.empresa_unidades enable row level security;

drop trigger if exists tg_empresa_unidades_updated_at on public.empresa_unidades;
create trigger tg_empresa_unidades_updated_at
before update on public.empresa_unidades
for each row execute function public.tg_set_updated_at();

drop policy if exists empresa_unidades_select on public.empresa_unidades;
create policy empresa_unidades_select
  on public.empresa_unidades
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','view')
  );

drop policy if exists empresa_unidades_write_manage on public.empresa_unidades;
create policy empresa_unidades_write_manage
  on public.empresa_unidades
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','manage')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','manage')
  );

grant select, insert, update, delete on table public.empresa_unidades to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Preferência do usuário: unidade ativa (por empresa)
-- -----------------------------------------------------------------------------
create table if not exists public.user_active_unidade (
  user_id uuid not null default auth.uid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  unidade_id uuid not null references public.empresa_unidades(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, empresa_id)
);

create index if not exists idx_user_active_unidade_empresa on public.user_active_unidade(empresa_id, updated_at desc);

alter table public.user_active_unidade enable row level security;

drop trigger if exists tg_user_active_unidade_updated_at on public.user_active_unidade;
create trigger tg_user_active_unidade_updated_at
before update on public.user_active_unidade
for each row execute function public.tg_set_updated_at();

drop policy if exists user_active_unidade_sel on public.user_active_unidade;
create policy user_active_unidade_sel
  on public.user_active_unidade
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','view')
  );

drop policy if exists user_active_unidade_ins on public.user_active_unidade;
create policy user_active_unidade_ins
  on public.user_active_unidade
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','view')
  );

drop policy if exists user_active_unidade_upd on public.user_active_unidade;
create policy user_active_unidade_upd
  on public.user_active_unidade
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','view')
  )
  with check (
    user_id = auth.uid()
    and empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','view')
  );

drop policy if exists user_active_unidade_del on public.user_active_unidade;
create policy user_active_unidade_del
  on public.user_active_unidade
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('unidades','view')
  );

grant select, insert, update, delete on table public.user_active_unidade to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Funções utilitárias / RPCs
-- -----------------------------------------------------------------------------
drop function if exists public.current_unidade_id();
create function public.current_unidade_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_unidade uuid;
begin
  if v_empresa is null then
    return null;
  end if;

  -- Preferência persistida
  select uae.unidade_id into v_unidade
  from public.user_active_unidade uae
  where uae.empresa_id = v_empresa
    and uae.user_id = v_user
  limit 1;

  if v_unidade is not null then
    return v_unidade;
  end if;

  -- Fallback: unidade default
  select eu.id into v_unidade
  from public.empresa_unidades eu
  where eu.empresa_id = v_empresa
    and eu.ativo = true
    and eu.is_default = true
  order by eu.updated_at desc
  limit 1;

  if v_unidade is not null then
    return v_unidade;
  end if;

  -- Fallback final: 1ª unidade ativa
  select eu.id into v_unidade
  from public.empresa_unidades eu
  where eu.empresa_id = v_empresa
    and eu.ativo = true
  order by eu.created_at asc
  limit 1;

  return v_unidade;
end;
$$;

revoke all on function public.current_unidade_id() from public;
grant execute on function public.current_unidade_id() to authenticated, service_role;

drop function if exists public.unidades_list();
create function public.unidades_list()
returns table (
  id uuid,
  nome text,
  codigo text,
  ativo boolean,
  is_default boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('unidades','view');
  if v_empresa is null then
    return;
  end if;

  return query
  select eu.id, eu.nome, eu.codigo, eu.ativo, eu.is_default, eu.created_at, eu.updated_at
  from public.empresa_unidades eu
  where eu.empresa_id = v_empresa
  order by eu.is_default desc, eu.ativo desc, eu.nome asc;
end;
$$;

revoke all on function public.unidades_list() from public;
grant execute on function public.unidades_list() to authenticated, service_role;

drop function if exists public.unidades_upsert(jsonb);
create function public.unidades_upsert(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(coalesce(p_payload->>'id',''),'')::uuid;
  v_nome text := nullif(btrim(coalesce(p_payload->>'nome','')), '');
  v_codigo text := nullif(btrim(coalesce(p_payload->>'codigo','')), '');
  v_ativo boolean := coalesce((p_payload->>'ativo')::boolean, true);
  v_default boolean := coalesce((p_payload->>'is_default')::boolean, false);
  v_out uuid;
begin
  perform public.require_permission_for_current_user('unidades','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;
  if v_nome is null then
    raise exception 'nome é obrigatório' using errcode='23502';
  end if;

  if v_default then
    update public.empresa_unidades
      set is_default = false
    where empresa_id = v_empresa
      and is_default = true;
  end if;

  if v_id is null then
    insert into public.empresa_unidades (empresa_id, nome, codigo, ativo, is_default)
    values (v_empresa, v_nome, v_codigo, v_ativo, v_default)
    returning id into v_out;
  else
    update public.empresa_unidades
      set nome = v_nome,
          codigo = v_codigo,
          ativo = v_ativo,
          is_default = v_default
    where id = v_id
      and empresa_id = v_empresa
    returning id into v_out;
  end if;

  return v_out;
end;
$$;

revoke all on function public.unidades_upsert(jsonb) from public;
grant execute on function public.unidades_upsert(jsonb) to authenticated, service_role;

drop function if exists public.unidades_delete(uuid);
create function public.unidades_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('unidades','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  delete from public.empresa_unidades
  where id = p_id
    and empresa_id = v_empresa;
end;
$$;

revoke all on function public.unidades_delete(uuid) from public;
grant execute on function public.unidades_delete(uuid) to authenticated, service_role;

drop function if exists public.unidades_set_active(uuid);
create function public.unidades_set_active(p_unidade_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_exists boolean;
begin
  perform public.require_permission_for_current_user('unidades','view');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  select exists(
    select 1 from public.empresa_unidades eu
    where eu.id = p_unidade_id
      and eu.empresa_id = v_empresa
      and eu.ativo = true
  ) into v_exists;

  if not v_exists then
    raise exception 'Unidade inválida ou inativa' using errcode='P0002';
  end if;

  insert into public.user_active_unidade (user_id, empresa_id, unidade_id, updated_at)
  values (v_user, v_empresa, p_unidade_id, now())
  on conflict (user_id, empresa_id) do update
    set unidade_id = excluded.unidade_id,
        updated_at = excluded.updated_at;

  return p_unidade_id;
end;
$$;

revoke all on function public.unidades_set_active(uuid) from public;
grant execute on function public.unidades_set_active(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Auditoria administrativa: ativar audit_logs_trigger (best-effort)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR to_regprocedure('public.process_audit_log()') IS NULL THEN
    RAISE NOTICE 'ADM-STA-04: audit_logs/process_audit_log não encontrado; pulando triggers.';
    RETURN;
  END IF;

  -- Tabelas administrativas-chave (se existirem)
  IF to_regclass('public.empresa_unidades') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.empresa_unidades';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.empresa_unidades FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.user_active_unidade') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.user_active_unidade';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.user_active_unidade FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.empresa_usuarios') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.empresa_usuarios';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.empresa_usuarios FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.roles') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.roles';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.role_permissions';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.empresa_entitlements') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.empresa_entitlements';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.empresa_entitlements FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END $$;

COMMIT;

