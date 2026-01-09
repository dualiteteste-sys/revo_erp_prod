/*
  FIX: RPCs retornando 400 (runtime) em PROD

  Contexto
  - Suprimentos -> Ordens de Compra estava falhando ao chamar `public.compras_list_pedidos`
    (historicamente já existiu uma definição com `numero integer`, mas a coluna é `bigint`,
    o que pode causar erro de execução "structure of query does not match function result type").
  - Financeiro -> Relatórios / Dashboard RH & Qualidade estava falhando ao chamar
    `public.financeiro_relatorio_por_centro_custo` (histórico de FULL JOIN não-joinable).

  O que muda
  - Recria `public.compras_list_pedidos` com assinatura/paginação e tipos corretos.
  - Recria `public.financeiro_relatorio_por_centro_custo` evitando FULL JOIN (usa UNION ALL).

  Impacto
  - Corrige 400 no PostgREST / RPC e mantém compatibilidade com o frontend atual.

  Reversibilidade
  - Reverter este arquivo ou reaplicar versões anteriores das funções via migrations anteriores.
*/

begin;

-- -----------------------------------------------------------------------------
-- Suprimentos: compras_list_pedidos (tipos corretos + paginação server-side)
-- -----------------------------------------------------------------------------

drop function if exists public.compras_list_pedidos(text, text);
drop function if exists public.compras_list_pedidos(text, text, integer, integer);

create or replace function public.compras_list_pedidos(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  numero bigint,
  fornecedor_id uuid,
  fornecedor_nome text,
  data_emissao date,
  data_prevista date,
  status text,
  total_produtos numeric,
  frete numeric,
  desconto numeric,
  total_geral numeric,
  observacoes text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permission_for_current_user('suprimentos','view');

  return query
  select
    c.id,
    c.numero,
    c.fornecedor_id,
    f.nome as fornecedor_nome,
    c.data_emissao,
    c.data_prevista,
    c.status::text as status,
    c.total_produtos,
    c.frete,
    c.desconto,
    c.total_geral,
    c.observacoes,
    count(*) over() as total_count
  from public.compras_pedidos c
  left join public.pessoas f on f.id = c.fornecedor_id
  where c.empresa_id = v_emp
    and (
      p_status is null
      or btrim(p_status) = ''
      or c.status::text = p_status
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or c.numero::text like '%'||btrim(p_search)||'%'
      or lower(coalesce(f.nome,'')) like '%'||lower(btrim(p_search))||'%'
    )
  order by c.numero desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.compras_list_pedidos(text, text, integer, integer) from public, anon;
grant execute on function public.compras_list_pedidos(text, text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Financeiro: relatório por centro de custo (evita FULL JOIN não-joinable)
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

