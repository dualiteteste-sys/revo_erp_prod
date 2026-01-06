/*
  INT-STA-03 — Versionamento de adaptadores (migração de payloads sem quebrar)

  Objetivo
  - Garantir que jobs/eventos antigos continuem processáveis após mudanças no adaptador.
  - Registrar a versão do adaptador usada para gerar cada job/run (observabilidade + rollback).
  - Preparar caminho para migrações de payload (v1 -> v2) sem downtime.

  Abordagem (baseline)
  - Tabela `public.integration_adapter_versions` (provider+kind -> current/min_supported).
  - Coluna `adapter_version` em `ecommerce_jobs`, `ecommerce_job_runs`, `ecommerce_job_dead_letters`.
  - RPCs ops para listar/alterar versões (restrito a ops:manage).

  Nota
  - O processamento atual usa `adapter_version=1`. Mudanças futuras podem introduzir migração de payload por versão.
*/

BEGIN;

create table if not exists public.integration_adapter_versions (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  provider text not null,
  kind text not null,
  current_version int not null default 1,
  min_supported_version int not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint integration_adapter_versions_unique unique (empresa_id, provider, kind)
);

create index if not exists idx_integration_adapter_versions_empresa on public.integration_adapter_versions(empresa_id, provider, kind);

alter table public.integration_adapter_versions enable row level security;

drop policy if exists integration_adapter_versions_select_ops on public.integration_adapter_versions;
create policy integration_adapter_versions_select_ops
  on public.integration_adapter_versions
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ops','view')
  );

drop policy if exists integration_adapter_versions_write_ops on public.integration_adapter_versions;
create policy integration_adapter_versions_write_ops
  on public.integration_adapter_versions
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ops','manage')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ops','manage')
  );

grant select, insert, update, delete on table public.integration_adapter_versions to authenticated, service_role;

-- Version stamping em tabelas de fila (ecommerce)
do $$
begin
  if to_regclass('public.ecommerce_jobs') is not null then
    alter table public.ecommerce_jobs add column if not exists adapter_version int not null default 1;
  end if;
  if to_regclass('public.ecommerce_job_runs') is not null then
    alter table public.ecommerce_job_runs add column if not exists adapter_version int not null default 1;
  end if;
  if to_regclass('public.ecommerce_job_dead_letters') is not null then
    alter table public.ecommerce_job_dead_letters add column if not exists adapter_version int not null default 1;
  end if;
end $$;

-- RPCs (ops)
drop function if exists public.ops_list_adapter_versions();
create function public.ops_list_adapter_versions()
returns table (
  id uuid,
  provider text,
  kind text,
  current_version int,
  min_supported_version int,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('ops','view');
  if v_empresa is null then return; end if;

  return query
  select v.id, v.provider, v.kind, v.current_version, v.min_supported_version, v.updated_at
  from public.integration_adapter_versions v
  where v.empresa_id = v_empresa
  order by v.provider, v.kind;
end;
$$;

revoke all on function public.ops_list_adapter_versions() from public;
grant execute on function public.ops_list_adapter_versions() to authenticated, service_role;

drop function if exists public.ops_set_adapter_version(text, text, int, int);
create function public.ops_set_adapter_version(
  p_provider text,
  p_kind text,
  p_current_version int,
  p_min_supported_version int default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_provider text := lower(nullif(btrim(coalesce(p_provider,'')), ''));
  v_kind text := lower(nullif(btrim(coalesce(p_kind,'')), ''));
  v_cur int := greatest(coalesce(p_current_version, 1), 1);
  v_min int := greatest(coalesce(p_min_supported_version, v_cur), 1);
  v_id uuid;
begin
  perform public.require_permission_for_current_user('ops','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;
  if v_provider is null or v_kind is null then
    raise exception 'provider/kind são obrigatórios' using errcode='23502';
  end if;
  if v_min > v_cur then
    v_min := v_cur;
  end if;

  insert into public.integration_adapter_versions (empresa_id, provider, kind, current_version, min_supported_version, updated_at)
  values (v_empresa, v_provider, v_kind, v_cur, v_min, now())
  on conflict (empresa_id, provider, kind) do update
    set current_version = excluded.current_version,
        min_supported_version = excluded.min_supported_version,
        updated_at = excluded.updated_at
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.ops_set_adapter_version(text, text, int, int) from public;
grant execute on function public.ops_set_adapter_version(text, text, int, int) to authenticated, service_role;

COMMIT;

