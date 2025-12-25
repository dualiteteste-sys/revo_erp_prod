-- =============================================================================
-- Serviços: listagem v2 + contagem (paginação real)
-- - Mantém RPC legada `list_services_for_current_user(...)`
-- - Adiciona:
--   - `list_services_for_current_user_v2(p_search, p_status, p_limit, p_offset, p_order_by, p_order_dir)`
--   - `count_services_for_current_user(p_search, p_status)`
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Compat (clean DB): garantir tipo/tabela/RPCs base do módulo de Serviços.
-- Este módulo existia apenas em migrations_legacy; sem isso o verify (clean DB) falha.
-- -----------------------------------------------------------------------------

-- Enum status_servico (idempotente)
do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'status_servico'
      and t.typnamespace = 'public'::regnamespace
  ) then
    execute 'create type public.status_servico as enum (''ativo'', ''inativo'')';
  end if;
end$$;

-- Tabela servicos (idempotente)
create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  descricao text not null,
  codigo text,
  preco_venda numeric(12,2),
  unidade text,
  status public.status_servico not null default 'ativo',
  codigo_servico text,
  nbs text,
  nbs_ibpt_required boolean default false,
  descricao_complementar text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger updated_at (idempotente)
drop trigger if exists tg_servicos_set_updated_at on public.servicos;
create trigger tg_servicos_set_updated_at
before update on public.servicos
for each row execute function public.tg_set_updated_at();

-- Índices
create index if not exists idx_servicos_empresa on public.servicos(empresa_id);
create index if not exists idx_servicos_empresa_descricao on public.servicos(empresa_id, descricao);
create unique index if not exists uq_servicos_empresa_codigo
  on public.servicos(empresa_id, codigo)
  where codigo is not null;

-- RLS
alter table public.servicos enable row level security;

drop policy if exists sel_servicos_by_empresa on public.servicos;
create policy sel_servicos_by_empresa
  on public.servicos
  for select
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_servicos_same_empresa on public.servicos;
create policy ins_servicos_same_empresa
  on public.servicos
  for insert
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_servicos_same_empresa on public.servicos;
create policy upd_servicos_same_empresa
  on public.servicos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_servicos_same_empresa on public.servicos;
create policy del_servicos_same_empresa
  on public.servicos
  for delete
  using (empresa_id = public.current_empresa_id());

-- RPCs base (compat com frontend)
create or replace function public.create_service_for_current_user(payload jsonb)
returns public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CREATE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  insert into public.servicos (
    empresa_id, descricao, codigo, preco_venda, unidade, status,
    codigo_servico, nbs, nbs_ibpt_required,
    descricao_complementar, observacoes
  )
  values (
    v_empresa_id,
    payload->>'descricao',
    nullif(payload->>'codigo',''),
    nullif(payload->>'preco_venda','')::numeric,
    payload->>'unidade',
    coalesce(nullif(payload->>'status','')::public.status_servico, 'ativo'),
    payload->>'codigo_servico',
    payload->>'nbs',
    coalesce(nullif(payload->>'nbs_ibpt_required','')::boolean, false),
    payload->>'descricao_complementar',
    payload->>'observacoes'
  )
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.create_service_for_current_user(jsonb) from public;
grant execute on function public.create_service_for_current_user(jsonb) to authenticated, service_role;

create or replace function public.update_service_for_current_user(p_id uuid, payload jsonb)
returns public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][UPDATE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  update public.servicos s
     set descricao            = coalesce(nullif(payload->>'descricao',''), s.descricao),
         codigo               = case when payload ? 'codigo'
                                     then nullif(payload->>'codigo','')
                                     else s.codigo end,
         preco_venda          = coalesce(nullif(payload->>'preco_venda','')::numeric, s.preco_venda),
         unidade              = coalesce(nullif(payload->>'unidade',''), s.unidade),
         status               = coalesce(nullif(payload->>'status','')::public.status_servico, s.status),
         codigo_servico       = coalesce(nullif(payload->>'codigo_servico',''), s.codigo_servico),
         nbs                  = coalesce(nullif(payload->>'nbs',''), s.nbs),
         nbs_ibpt_required    = coalesce(nullif(payload->>'nbs_ibpt_required','')::boolean, s.nbs_ibpt_required),
         descricao_complementar = coalesce(nullif(payload->>'descricao_complementar',''), s.descricao_complementar),
         observacoes          = coalesce(nullif(payload->>'observacoes',''), s.observacoes)
   where s.id = p_id
     and s.empresa_id = v_empresa_id
  returning * into rec;

  if not found then
    raise exception '[RPC][UPDATE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;

  return rec;
end;
$$;

revoke all on function public.update_service_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_service_for_current_user(uuid, jsonb) to authenticated, service_role;

create or replace function public.delete_service_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if v_empresa_id is null then
    raise exception '[RPC][DELETE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  delete from public.servicos s
  where s.id = p_id
    and s.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][DELETE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;
end;
$$;

revoke all on function public.delete_service_for_current_user(uuid) from public;
grant execute on function public.delete_service_for_current_user(uuid) to authenticated, service_role;

create or replace function public.get_service_by_id_for_current_user(p_id uuid)
returns public.servicos
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select s.*
  from public.servicos s
  where s.id = p_id
    and s.empresa_id = public.current_empresa_id()
  limit 1
$$;

revoke all on function public.get_service_by_id_for_current_user(uuid) from public;
grant execute on function public.get_service_by_id_for_current_user(uuid) to authenticated, service_role;

create or replace function public.list_services_for_current_user(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_order_by text default 'descricao',
  p_order_dir text default 'asc'
)
returns setof public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_sql text;
begin
  if v_empresa_id is null then
    raise exception '[RPC][LIST_SERVICES] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  v_sql := format($q$
    select *
    from public.servicos
    where empresa_id = $1
      %s
    order by %I %s
    limit $2 offset $3
  $q$,
    case when p_search is null or btrim(p_search) = '' then '' else 'and (descricao ilike ''%''||$4||''%'' or coalesce(codigo, '''') ilike ''%''||$4||''%'')' end,
    p_order_by,
    case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end
  );

  return query execute v_sql using
    v_empresa_id, p_limit, p_offset,
    case when p_search is null then null else p_search end;
end;
$$;

revoke all on function public.list_services_for_current_user(text, int, int, text, text) from public;
grant execute on function public.list_services_for_current_user(text, int, int, text, text) to authenticated, service_role;

-- LIST v2 (com filtro de status e busca ampliada)
DROP FUNCTION IF EXISTS public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text);
CREATE OR REPLACE FUNCTION public.list_services_for_current_user_v2(
  p_search text default null,
  p_status public.status_servico default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_order_by text default 'descricao',
  p_order_dir text default 'asc'
)
RETURNS SETOF public.servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_sql text;
  v_order_by text := lower(coalesce(p_order_by, 'descricao'));
  v_order_dir text := case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end;
  v_order_col text;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][LIST_SERVICES_V2] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  v_order_col := CASE
    WHEN v_order_by IN ('descricao','codigo','preco_venda','unidade','status','created_at','updated_at') THEN v_order_by
    ELSE 'descricao'
  END;

  v_sql := format($q$
    SELECT *
    FROM public.servicos
    WHERE empresa_id = $1
      %s
      %s
    ORDER BY %I %s
    LIMIT $2 OFFSET $3
  $q$,
    CASE
      WHEN p_search IS NULL OR btrim(p_search) = '' THEN ''
      ELSE 'AND (descricao ILIKE ''%''||$4||''%'' OR coalesce(codigo, '''') ILIKE ''%''||$4||''%'' OR coalesce(codigo_servico, '''') ILIKE ''%''||$4||''%'' OR coalesce(nbs, '''') ILIKE ''%''||$4||''%'')'
    END,
    CASE
      WHEN p_status IS NULL THEN ''
      ELSE 'AND status = $5'
    END,
    v_order_col,
    v_order_dir
  );

  RETURN QUERY EXECUTE v_sql USING
    v_empresa_id, greatest(p_limit, 0), greatest(p_offset, 0),
    CASE WHEN p_search IS NULL THEN NULL ELSE p_search END,
    p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text) TO authenticated, service_role;

-- COUNT (paginação real)
DROP FUNCTION IF EXISTS public.count_services_for_current_user(text, public.status_servico);
CREATE OR REPLACE FUNCTION public.count_services_for_current_user(
  p_search text default null,
  p_status public.status_servico default null
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)
  FROM public.servicos s
  WHERE s.empresa_id = public.current_empresa_id()
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR s.descricao ILIKE '%' || p_search || '%'
      OR coalesce(s.codigo, '') ILIKE '%' || p_search || '%'
      OR coalesce(s.codigo_servico, '') ILIKE '%' || p_search || '%'
      OR coalesce(s.nbs, '') ILIKE '%' || p_search || '%'
    )
    AND (
      p_status IS NULL OR s.status = p_status
    );
$$;

REVOKE ALL ON FUNCTION public.count_services_for_current_user(text, public.status_servico) FROM public;
GRANT EXECUTE ON FUNCTION public.count_services_for_current_user(text, public.status_servico) TO authenticated, service_role;

COMMIT;
