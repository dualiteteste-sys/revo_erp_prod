/*
  FIN-DRE-01c (P1) DRE v1 — hotfix de RPCs (produção)

  Causas raiz (provas)
  - 42703 (column "dre_key" does not exist): a query final do relatório não tinha `FROM mapped`,
    então `dre_key` era interpretado como coluna “solta” (inexistente).
  - 42702 (column reference "origem_tipo" is ambiguous): `ON CONFLICT (empresa_id, origem_tipo, origem_valor)`
    colide com variáveis implícitas do `RETURNS TABLE (...)` em PL/pgSQL. Troca para `ON CONSTRAINT`
    elimina referência ambígua e mantém idempotência.

  Regras do repo
  - RPC-first (financeiro_% sem grants diretos para authenticated/anon).
  - Multi-tenant: sempre `current_empresa_id()` + RLS (fail-closed).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) RPC: salvar mapeamento (fix ambiguidade PL/pgSQL)
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_dre_mapeamentos_set_v1(
  p_origem_tipo text,
  p_origem_valor text,
  p_dre_linha_key text
)
returns table (
  id uuid,
  origem_tipo text,
  origem_valor text,
  dre_linha_key text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_origem_tipo text := coalesce(nullif(btrim(p_origem_tipo), ''), 'mov_categoria');
  v_origem_valor text := nullif(btrim(p_origem_valor), '');
  v_dre_key text := nullif(btrim(p_dre_linha_key), '');
  v_allowed_keys text[] := array[
    'receita_bruta',
    'deducoes_impostos',
    'cmv_cpv_csp',
    'despesas_operacionais_adm',
    'despesas_operacionais_comerciais',
    'despesas_operacionais_gerais',
    'depreciacao_amortizacao',
    'resultado_financeiro',
    'outras_receitas_despesas',
    'irpj_csll'
  ];
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');

  if v_origem_tipo <> 'mov_categoria' then
    raise exception 'origem_tipo inválido (esperado: mov_categoria)';
  end if;

  if v_origem_valor is null then
    raise exception 'origem_valor é obrigatório';
  end if;

  if v_dre_key is null or not (v_dre_key = any(v_allowed_keys)) then
    raise exception 'dre_linha_key inválida';
  end if;

  insert into public.financeiro_dre_mapeamentos (empresa_id, origem_tipo, origem_valor, dre_linha_key)
  values (v_empresa, v_origem_tipo, v_origem_valor, v_dre_key)
  on conflict on constraint fin_dre_map_empresa_origem_uk
  do update set dre_linha_key = excluded.dre_linha_key, updated_at = now()
  returning
    public.financeiro_dre_mapeamentos.id,
    public.financeiro_dre_mapeamentos.origem_tipo,
    public.financeiro_dre_mapeamentos.origem_valor,
    public.financeiro_dre_mapeamentos.dre_linha_key,
    public.financeiro_dre_mapeamentos.created_at,
    public.financeiro_dre_mapeamentos.updated_at
  into id, origem_tipo, origem_valor, dre_linha_key, created_at, updated_at;

  return next;
end;
$$;

revoke all on function public.financeiro_dre_mapeamentos_set_v1(text, text, text) from public;
grant execute on function public.financeiro_dre_mapeamentos_set_v1(text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) RPC: relatório DRE (fix `FROM mapped`)
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_dre_report_v1(
  p_start_date date default null,
  p_end_date date default null,
  p_regime text default 'competencia',
  p_centro_de_custo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, date_trunc('month', current_date)::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
  v_regime text := coalesce(nullif(btrim(p_regime), ''), 'competencia');

  v_receita_bruta numeric := 0;
  v_deducoes numeric := 0;
  v_cmv numeric := 0;
  v_desp_adm numeric := 0;
  v_desp_com numeric := 0;
  v_desp_ger numeric := 0;
  v_depr numeric := 0;
  v_fin numeric := 0;
  v_outras numeric := 0;
  v_ir numeric := 0;
  v_unmapped numeric := 0;

  v_receita_liquida numeric := 0;
  v_lucro_bruto numeric := 0;
  v_ebitda numeric := 0;
  v_resultado_operacional numeric := 0;
  v_resultado_antes_ir numeric := 0;
  v_lucro_liquido numeric := 0;
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  if v_regime not in ('competencia','caixa') then
    raise exception 'regime inválido (esperado: competencia|caixa)';
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');
  perform public._fin04_assert_centro_de_custo(p_centro_de_custo_id);

  with base as (
    select
      coalesce(nullif(btrim(m.categoria), ''), 'Sem categoria') as categoria_norm,
      m.tipo_mov,
      m.valor
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and (
        case when v_regime = 'caixa'
          then m.data_movimento
          else coalesce(m.data_competencia, m.data_movimento)
        end
      ) between v_start and v_end
      and (p_centro_de_custo_id is null or m.centro_de_custo_id = p_centro_de_custo_id)
  ),
  signed as (
    select
      b.categoria_norm,
      case when b.tipo_mov = 'entrada' then b.valor else -b.valor end as signed_valor
    from base b
  ),
  mapped as (
    select
      coalesce(map.dre_linha_key, 'unmapped') as dre_key,
      sum(s.signed_valor) as total
    from signed s
    left join public.financeiro_dre_mapeamentos map
      on map.empresa_id = v_empresa
     and map.origem_tipo = 'mov_categoria'
     and map.origem_valor = s.categoria_norm
    group by 1
  )
  select
    coalesce(sum(case when dre_key = 'receita_bruta' then total end), 0),
    coalesce(sum(case when dre_key = 'deducoes_impostos' then total end), 0),
    coalesce(sum(case when dre_key = 'cmv_cpv_csp' then total end), 0),
    coalesce(sum(case when dre_key = 'despesas_operacionais_adm' then total end), 0),
    coalesce(sum(case when dre_key = 'despesas_operacionais_comerciais' then total end), 0),
    coalesce(sum(case when dre_key = 'despesas_operacionais_gerais' then total end), 0),
    coalesce(sum(case when dre_key = 'depreciacao_amortizacao' then total end), 0),
    coalesce(sum(case when dre_key = 'resultado_financeiro' then total end), 0),
    coalesce(sum(case when dre_key = 'outras_receitas_despesas' then total end), 0),
    coalesce(sum(case when dre_key = 'irpj_csll' then total end), 0),
    coalesce(sum(case when dre_key = 'unmapped' then total end), 0)
  into
    v_receita_bruta,
    v_deducoes,
    v_cmv,
    v_desp_adm,
    v_desp_com,
    v_desp_ger,
    v_depr,
    v_fin,
    v_outras,
    v_ir,
    v_unmapped
  from mapped;

  v_receita_liquida := v_receita_bruta + v_deducoes;
  v_lucro_bruto := v_receita_liquida + v_cmv;
  v_ebitda := v_lucro_bruto + v_desp_adm + v_desp_com + v_desp_ger;
  v_resultado_operacional := v_ebitda + v_depr;
  v_resultado_antes_ir := v_resultado_operacional + v_fin + v_outras;
  v_lucro_liquido := v_resultado_antes_ir + v_ir;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'start_date', v_start,
      'end_date', v_end,
      'regime', v_regime,
      'centro_de_custo_id', p_centro_de_custo_id
    ),
    'linhas', jsonb_build_object(
      'receita_bruta', v_receita_bruta,
      'deducoes_impostos', v_deducoes,
      'receita_liquida', v_receita_liquida,
      'cmv_cpv_csp', v_cmv,
      'lucro_bruto', v_lucro_bruto,
      'despesas_operacionais_adm', v_desp_adm,
      'despesas_operacionais_comerciais', v_desp_com,
      'despesas_operacionais_gerais', v_desp_ger,
      'ebitda', v_ebitda,
      'depreciacao_amortizacao', v_depr,
      'resultado_operacional', v_resultado_operacional,
      'resultado_financeiro', v_fin,
      'outras_receitas_despesas', v_outras,
      'resultado_antes_irpj_csll', v_resultado_antes_ir,
      'irpj_csll', v_ir,
      'lucro_liquido', v_lucro_liquido,
      'unmapped', v_unmapped
    )
  );
end;
$$;

revoke all on function public.financeiro_dre_report_v1(date, date, text, uuid) from public;
grant execute on function public.financeiro_dre_report_v1(date, date, text, uuid) to authenticated, service_role;

commit;

