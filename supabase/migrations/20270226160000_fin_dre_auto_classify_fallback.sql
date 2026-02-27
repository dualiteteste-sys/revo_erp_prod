/*
  FIN-DRE-01d — DRE: auto-classificação por tipo_mov quando sem mapeamento explícito

  Problema
  - Sem mapeamentos configurados, TODOS os lançamentos iam para `unmapped`.
  - O DRE mostrava R$ 0,00 em todas as linhas nomeadas, parecendo zerado/quebrado.

  Solução
  - Auto-classify de fallback: quando não existe `financeiro_dre_mapeamentos` para
    uma categoria, classifica automaticamente por `tipo_mov`:
      - entrada → receita_bruta
      - saida   → despesas_operacionais_gerais
  - Mapeamentos explícitos têm precedência — o usuário ainda pode refinar.
  - O campo `unmapped` no JSON retorna 0 (tudo é classificado agora).
  - `financeiro_dre_unmapped_categorias_v1` permanece igual: mostra categorias
    SEM mapeamento EXPLÍCITO para o usuário configurar.

  Multi-tenant / Segurança
  - SECURITY DEFINER + set search_path (igual ao original).
  - Permissões inalteradas (authenticated, service_role).
*/

begin;

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
      b.tipo_mov,
      case when b.tipo_mov = 'entrada' then b.valor else -b.valor end as signed_valor
    from base b
  ),
  mapped as (
    select
      coalesce(
        map.dre_linha_key,
        -- Auto-classify fallback quando sem mapeamento explícito:
        -- entradas → receita_bruta, saídas → despesas_operacionais_gerais
        case when s.tipo_mov = 'entrada'
          then 'receita_bruta'
          else 'despesas_operacionais_gerais'
        end
      ) as dre_key,
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

select pg_notify('pgrst', 'reload schema');

commit;
