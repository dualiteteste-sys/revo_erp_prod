-- =============================================================================
-- Fix: Metas de Vendas (UI/serviços) – alinhar RPCs e schema
-- Problema observado no console:
-- - /rpc/count_metas_vendas 404
-- - inconsistência de assinatura/shape entre frontend e DB
-- Objetivo:
-- - adicionar colunas necessárias e RPCs esperadas pelo app
-- - evitar overload ambíguo (HTTP_300) e forçar reload do PostgREST
-- =============================================================================

BEGIN;

-- 1) Schema: complementar metas_vendas para o modelo do app
do $$
begin
  if to_regclass('public.metas_vendas') is null then
    raise exception 'metas_vendas não existe (migração base ausente).';
  end if;
end $$;

alter table public.metas_vendas
  add column if not exists vendedor_id uuid references public.pessoas(id) on delete set null,
  add column if not exists valor_realizado numeric not null default 0 check (valor_realizado >= 0),
  add column if not exists status text not null default 'nao_iniciada' check (status in ('nao_iniciada','em_andamento','concluida','cancelada'));

-- Mantém compatibilidade: valor_atingido (legado) espelha valor_realizado
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='metas_vendas' and column_name='valor_atingido'
  ) then
    update public.metas_vendas set valor_atingido = valor_realizado where valor_atingido is distinct from valor_realizado;
  end if;
end $$;

create index if not exists ix_metas_vendas_empresa_vendedor on public.metas_vendas(empresa_id, vendedor_id);
create index if not exists ix_metas_vendas_empresa_status on public.metas_vendas(empresa_id, status);

-- 2) RPCs: evitar overload e expor API esperada
drop function if exists public.list_metas_vendas(text, integer, integer);

create or replace function public.count_metas_vendas(
  p_q text default null,
  p_status text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count bigint;
begin
  if not public.has_permission_for_current_user('vendas','view') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select count(*) into v_count
  from public.metas_vendas m
  left join public.pessoas p on p.id = m.vendedor_id
  where m.empresa_id = v_empresa
    and (p_status is null or m.status = p_status)
    and (
      p_q is null
      or coalesce(p.nome,'') ilike '%'||p_q||'%'
    );

  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.count_metas_vendas(text, text) from public;
grant execute on function public.count_metas_vendas(text, text) to authenticated, service_role;

create or replace function public.list_metas_vendas(
  p_limit integer default 20,
  p_offset integer default 0,
  p_q text default null,
  p_status text default null,
  p_order_by text default 'data_inicio',
  p_order_dir text default 'desc'
)
returns table (
  id uuid,
  empresa_id uuid,
  vendedor_id uuid,
  vendedor_nome text,
  data_inicio date,
  data_fim date,
  valor_meta numeric,
  valor_realizado numeric,
  atingimento numeric,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_dir text := case when lower(coalesce(p_order_dir,'desc')) = 'asc' then 'asc' else 'desc' end;
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not public.has_permission_for_current_user('vendas','view') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return query
  with base as (
    select
      m.id,
      m.empresa_id,
      m.vendedor_id,
      coalesce(p.nome, '-') as vendedor_nome,
      m.data_inicio,
      m.data_fim,
      m.valor_meta,
      m.valor_realizado,
      case when m.valor_meta > 0 then round((m.valor_realizado / m.valor_meta) * 100, 2) else 0 end as atingimento,
      m.status,
      m.created_at,
      m.updated_at
    from public.metas_vendas m
    left join public.pessoas p on p.id = m.vendedor_id
    where m.empresa_id = v_empresa
      and (p_status is null or m.status = p_status)
      and (
        p_q is null
        or coalesce(p.nome,'') ilike '%'||p_q||'%'
      )
  )
  select *
  from base
  order by
    case when p_order_by = 'vendedor_nome' and v_dir = 'asc' then vendedor_nome end asc,
    case when p_order_by = 'vendedor_nome' and v_dir = 'desc' then vendedor_nome end desc,
    case when p_order_by = 'data_inicio' and v_dir = 'asc' then data_inicio end asc,
    case when p_order_by = 'data_inicio' and v_dir = 'desc' then data_inicio end desc,
    case when p_order_by = 'data_fim' and v_dir = 'asc' then data_fim end asc,
    case when p_order_by = 'data_fim' and v_dir = 'desc' then data_fim end desc,
    case when p_order_by = 'valor_meta' and v_dir = 'asc' then valor_meta end asc,
    case when p_order_by = 'valor_meta' and v_dir = 'desc' then valor_meta end desc,
    case when p_order_by = 'valor_realizado' and v_dir = 'asc' then valor_realizado end asc,
    case when p_order_by = 'valor_realizado' and v_dir = 'desc' then valor_realizado end desc,
    case when p_order_by = 'atingimento' and v_dir = 'asc' then atingimento end asc,
    case when p_order_by = 'atingimento' and v_dir = 'desc' then atingimento end desc,
    case when p_order_by = 'status' and v_dir = 'asc' then status end asc,
    case when p_order_by = 'status' and v_dir = 'desc' then status end desc,
    data_inicio desc,
    created_at desc
  limit v_limit
  offset v_offset;
end;
$$;
revoke all on function public.list_metas_vendas(integer, integer, text, text, text, text) from public;
grant execute on function public.list_metas_vendas(integer, integer, text, text, text, text) to authenticated, service_role;

create or replace function public.get_meta_venda_details(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec record;
begin
  if not public.has_permission_for_current_user('vendas','view') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select
    m.id,
    m.empresa_id,
    m.vendedor_id,
    coalesce(p.nome, '-') as vendedor_nome,
    m.data_inicio,
    m.data_fim,
    m.valor_meta,
    m.valor_realizado,
    case when m.valor_meta > 0 then round((m.valor_realizado / m.valor_meta) * 100, 2) else 0 end as atingimento,
    m.status,
    m.created_at,
    m.updated_at
  into rec
  from public.metas_vendas m
  left join public.pessoas p on p.id = m.vendedor_id
  where m.id = p_id and m.empresa_id = v_empresa;

  if rec is null then
    raise exception 'Meta não encontrada.';
  end if;

  return to_jsonb(rec);
end;
$$;
revoke all on function public.get_meta_venda_details(uuid) from public;
grant execute on function public.get_meta_venda_details(uuid) to authenticated, service_role;

-- Cria/atualiza meta (alinhado com UI: vendedor_id + período + valor_meta)
drop function if exists public.create_update_meta_venda(jsonb);
create or replace function public.create_update_meta_venda(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_empresa uuid := public.current_empresa_id();
  v_vendedor uuid := nullif(p_payload->>'vendedor_id','')::uuid;
  v_inicio date := (p_payload->>'data_inicio')::date;
  v_fim date := (p_payload->>'data_fim')::date;
  v_valor_meta numeric := coalesce((p_payload->>'valor_meta')::numeric, 0);
  v_status text := nullif(p_payload->>'status','');
begin
  if v_vendedor is null then
    raise exception 'vendedor_id é obrigatório.';
  end if;
  if v_inicio is null or v_fim is null then
    raise exception 'data_inicio e data_fim são obrigatórias.';
  end if;
  if v_valor_meta <= 0 then
    raise exception 'valor_meta deve ser > 0.';
  end if;

  if v_status is null then
    if current_date < v_inicio then
      v_status := 'nao_iniciada';
    elsif current_date > v_fim then
      v_status := 'concluida';
    else
      v_status := 'em_andamento';
    end if;
  end if;
  if v_status not in ('nao_iniciada','em_andamento','concluida','cancelada') then
    raise exception 'status inválido.';
  end if;

  if v_id is null then
    if not public.has_permission_for_current_user('vendas','create') then
      raise exception 'PERMISSION_DENIED';
    end if;

    insert into public.metas_vendas (
      empresa_id,
      vendedor_id,
      nome,
      descricao,
      tipo,
      valor_meta,
      valor_realizado,
      valor_atingido,
      data_inicio,
      data_fim,
      status
    ) values (
      v_empresa,
      v_vendedor,
      coalesce(nullif(p_payload->>'nome',''), 'Meta de Vendas'),
      nullif(p_payload->>'descricao',''),
      coalesce(nullif(p_payload->>'tipo','')::public.meta_tipo, 'valor'::public.meta_tipo),
      v_valor_meta,
      coalesce((p_payload->>'valor_realizado')::numeric, 0),
      coalesce((p_payload->>'valor_realizado')::numeric, 0),
      v_inicio,
      v_fim,
      v_status
    )
    returning id into v_id;
  else
    if not public.has_permission_for_current_user('vendas','update') then
      raise exception 'PERMISSION_DENIED';
    end if;

    update public.metas_vendas m
      set vendedor_id = v_vendedor,
          nome = coalesce(nullif(p_payload->>'nome',''), m.nome),
          descricao = coalesce(nullif(p_payload->>'descricao',''), m.descricao),
          tipo = coalesce(nullif(p_payload->>'tipo','')::public.meta_tipo, m.tipo),
          valor_meta = v_valor_meta,
          valor_realizado = coalesce((p_payload->>'valor_realizado')::numeric, m.valor_realizado),
          valor_atingido = coalesce((p_payload->>'valor_realizado')::numeric, m.valor_atingido),
          data_inicio = v_inicio,
          data_fim = v_fim,
          status = v_status,
          updated_at = now()
    where m.id = v_id and m.empresa_id = v_empresa;
  end if;

  return public.get_meta_venda_details(v_id);
end;
$$;
revoke all on function public.create_update_meta_venda(jsonb) from public;
grant execute on function public.create_update_meta_venda(jsonb) to authenticated, service_role;

-- Força reload do schema cache do PostgREST
select pg_notify('pgrst', 'reload schema');

COMMIT;

