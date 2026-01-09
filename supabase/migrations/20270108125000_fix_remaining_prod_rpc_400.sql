/*
  Fix: PROD RPCs retornando HTTP 400 (Compras / Financeiro / RH)

  Motivo:
  - `financeiro_relatorio_por_centro_custo` falha com:
      column reference "centro_id" is ambiguous
    porque `centro_id` existe como OUT param (plpgsql) e também como coluna no CTE.
  - `rh_training_compliance_summary` falha com:
      column p.participante_status does not exist
    porque a tabela `rh_treinamento_participantes` usa `status` e não tinha as colunas novas.
  - `compras_list_pedidos` ainda pode falhar em PROD quando tipos antigos divergem (ex.: numero/status),
    então reforçamos casts para deixar o retorno consistente com o esperado pelo app.

  Impacto:
  - Corrige erros 400 nos módulos:
    - Suprimentos → Ordens de Compra
    - Financeiro → Relatórios (por centro de custo)
    - RH → Dashboard/Qualidade (compliance de treinamentos)

  Reversibilidade:
  - Recriação de funções pode ser revertida reaplicando a definição anterior.
  - Colunas adicionadas em RH são aditivas (não destrutivas); para reverter exigiria DROP COLUMN.
*/

begin;

-- -----------------------------------------------------------------------------
-- Financeiro: elimina ambiguidade do identificador `centro_id` no CTE
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
    select r.centro_id as centro_id, r.entradas::numeric as entradas, 0::numeric as saidas from receber r
    union all
    select g.centro_id as centro_id, 0::numeric as entradas, g.saidas::numeric as saidas from pagar g
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

-- -----------------------------------------------------------------------------
-- RH: alinha colunas usadas pelo compliance summary (aditivo e idempotente)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.rh_treinamento_participantes') is not null then
    alter table public.rh_treinamento_participantes
      add column if not exists participante_status text;
    alter table public.rh_treinamento_participantes
      add column if not exists validade_ate date;
    alter table public.rh_treinamento_participantes
      add column if not exists proxima_reciclagem date;

    update public.rh_treinamento_participantes
       set participante_status = status
     where participante_status is null;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Suprimentos: reforça casts para compatibilidade com schemas antigos
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
  with base as (
    select
      c.id::uuid as id,
      nullif(regexp_replace(c.numero::text, '\\D', '', 'g'), '')::bigint as numero,
      nullif(c.fornecedor_id::text, '')::uuid as fornecedor_id,
      c.data_emissao::date as data_emissao,
      c.data_prevista::date as data_prevista,
      c.status::text as status,
      nullif(c.total_produtos::text, '')::numeric as total_produtos,
      nullif(c.frete::text, '')::numeric as frete,
      nullif(c.desconto::text, '')::numeric as desconto,
      nullif(c.total_geral::text, '')::numeric as total_geral,
      c.observacoes::text as observacoes
    from public.compras_pedidos c
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
      )
  )
  select
    b.id,
    b.numero,
    b.fornecedor_id,
    f.nome as fornecedor_nome,
    b.data_emissao,
    b.data_prevista,
    b.status,
    b.total_produtos,
    b.frete,
    b.desconto,
    b.total_geral,
    b.observacoes,
    count(*) over() as total_count
  from base b
  left join public.pessoas f on f.id = b.fornecedor_id
  where
    p_search is null
    or btrim(p_search) = ''
    or lower(coalesce(f.nome,'')) like '%'||lower(btrim(p_search))||'%'
  order by b.numero desc nulls last
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.compras_list_pedidos(text, text, integer, integer) from public, anon;
grant execute on function public.compras_list_pedidos(text, text, integer, integer) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

