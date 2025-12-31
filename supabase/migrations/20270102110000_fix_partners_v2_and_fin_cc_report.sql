/*
  Fixes:
  - Partners: list_partners_v2 wrapper was returning SETOF public.pessoas but delegating to _list_partners_v2 (table projection),
    causing runtime error "Returned type text does not match expected type uuid in column 2".
  - Financeiro: financeiro_relatorio_por_centro_custo used FULL JOIN with IS NOT DISTINCT FROM (not hash/merge joinable),
    causing runtime error "FULL JOIN is only supported with merge-joinable or hash-joinable join conditions".
*/

begin;

-- -----------------------------------------------------------------------------
-- Partners: restore correct return type for list_partners_v2 + count_partners_v2
-- -----------------------------------------------------------------------------
drop function if exists public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text);
do $$
begin
  if to_regprocedure('public._list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text)') is null then
    raise notice 'Fix list_partners_v2: _list_partners_v2 not found; skipping.';
    return;
  end if;

  execute $sql$
    create or replace function public.list_partners_v2(
      p_search text default null,
      p_tipo public.pessoa_tipo default null,
      p_status text default 'active',
      p_limit integer default 50,
      p_offset integer default 0,
      p_order_by text default 'nome',
      p_order_dir text default 'asc'
    )
    returns table (
      id uuid,
      nome text,
      tipo public.pessoa_tipo,
      doc_unico text,
      email text,
      telefone text,
      deleted_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    )
    language plpgsql
    security definer
    set search_path = pg_catalog, public
    as $body$
    begin
      perform public.require_permission_for_current_user('partners','view');
      return query
      select * from public._list_partners_v2(p_search, p_tipo, p_status, p_limit, p_offset, p_order_by, p_order_dir);
    end;
    $body$;
  $sql$;

  execute 'revoke all on function public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) from public';
  execute 'grant execute on function public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) to authenticated, service_role';
end;
$$;

drop function if exists public.count_partners_v2(text, public.pessoa_tipo, text);
do $$
begin
  if to_regprocedure('public._count_partners_v2(text, public.pessoa_tipo, text)') is null then
    raise notice 'Fix count_partners_v2: _count_partners_v2 not found; skipping.';
    return;
  end if;

  execute $sql$
    create or replace function public.count_partners_v2(
      p_search text default null,
      p_tipo public.pessoa_tipo default null,
      p_status text default 'active'
    )
    returns bigint
    language plpgsql
    security definer
    set search_path = pg_catalog, public
    as $body$
    begin
      perform public.require_permission_for_current_user('partners','view');
      return public._count_partners_v2(p_search, p_tipo, p_status);
    end;
    $body$;
  $sql$;

  execute 'revoke all on function public.count_partners_v2(text, public.pessoa_tipo, text) from public';
  execute 'grant execute on function public.count_partners_v2(text, public.pessoa_tipo, text) to authenticated, service_role';
end;
$$;

-- -----------------------------------------------------------------------------
-- Financeiro: rewrite report to avoid FULL JOIN non-joinable condition
-- -----------------------------------------------------------------------------
drop function if exists public.financeiro_relatorio_por_centro_custo(date, date);
create function public.financeiro_relatorio_por_centro_custo(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  centro_id uuid,
  centro_nome text,
  entradas numeric,
  saidas numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
begin
  perform public.require_permission_for_current_user('relatorios_financeiro','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  return query
  with receber as (
    select
      c.centro_de_custo_id as centro_id,
      sum(coalesce(c.valor_pago, c.valor))::numeric as entradas
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status = 'pago'::public.status_conta_receber
      and c.data_pagamento between v_start and v_end
    group by 1
  ),
  pagar as (
    select
      p.centro_de_custo_id as centro_id,
      sum(coalesce(p.valor_pago, 0))::numeric as saidas
    from public.financeiro_contas_pagar p
    where p.empresa_id = v_empresa
      and p.status = 'paga'
      and p.data_pagamento between v_start and v_end
    group by 1
  ),
  merged as (
    select centro_id, entradas::numeric as entradas, 0::numeric as saidas from receber
    union all
    select centro_id, 0::numeric as entradas, saidas::numeric as saidas from pagar
  )
  select
    m.centro_id,
    case
      when m.centro_id is null then 'Sem centro'
      else coalesce(cc.nome, 'Centro')
    end as centro_nome,
    sum(m.entradas)::numeric as entradas,
    sum(m.saidas)::numeric as saidas
  from merged m
  left join public.financeiro_centros_custos cc
    on cc.id = m.centro_id
   and cc.empresa_id = v_empresa
  group by m.centro_id, centro_nome
  order by (sum(m.entradas) + sum(m.saidas)) desc;
end;
$$;

revoke all on function public.financeiro_relatorio_por_centro_custo(date, date) from public;
grant execute on function public.financeiro_relatorio_por_centro_custo(date, date) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;
