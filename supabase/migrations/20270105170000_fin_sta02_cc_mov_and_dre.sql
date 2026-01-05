/*
  FIN-STA-02 (P1) Centro de custo por lançamento + DRE simplificada

  Motivo
  - O schema já possui `centro_de_custo_id` (FIN-04), porém a Tesouraria ainda gravava apenas `centro_custo` (texto).
  - Precisamos suportar `centro_de_custo_id` no upsert de movimentações e expor um relatório gerencial simples (DRE).

  Impacto
  - Tesouraria passa a persistir `centro_de_custo_id` quando enviado no payload.
  - Novo RPC `financeiro_dre_simplificada` para cards/tabela de DRE no app.

  Reversibilidade
  - Reaplicar/rollback manual: recriar função anterior (ou restaurar de backup).
  - Dados gravados em `centro_de_custo_id` podem ser limpos com UPDATE (se necessário).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tesouraria: suportar centro_de_custo_id (mantendo compatibilidade)
-- -----------------------------------------------------------------------------
create or replace function public.financeiro_movimentacoes_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_tipo text;
  v_valor numeric;
  v_cc_id uuid;
  v_centro_id uuid := nullif(p_payload->>'centro_de_custo_id','')::uuid;
begin
  v_tipo := coalesce(p_payload->>'tipo_mov', 'entrada');
  v_valor := (p_payload->>'valor')::numeric;
  v_cc_id := (p_payload->>'conta_corrente_id')::uuid;

  if v_cc_id is null then
    raise exception 'conta_corrente_id é obrigatório.';
  end if;
  if v_tipo not in ('entrada','saida') then
    raise exception 'tipo_mov inválido.';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'valor inválido.';
  end if;

  -- Valida centro de custo (mesma empresa + ativo) quando informado
  perform public._fin04_assert_centro_de_custo(v_centro_id);

  if p_payload->>'id' is not null then
    update public.financeiro_movimentacoes m
    set
      conta_corrente_id   = v_cc_id,
      data_movimento      = coalesce((p_payload->>'data_movimento')::date, data_movimento),
      data_competencia    = (p_payload->>'data_competencia')::date,
      tipo_mov            = v_tipo,
      valor               = v_valor,
      descricao           = p_payload->>'descricao',
      documento_ref       = p_payload->>'documento_ref',
      origem_tipo         = p_payload->>'origem_tipo',
      origem_id           = nullif(p_payload->>'origem_id','')::uuid,
      categoria           = p_payload->>'categoria',
      centro_custo        = p_payload->>'centro_custo',
      centro_de_custo_id  = v_centro_id,
      observacoes         = p_payload->>'observacoes'
    where m.id = (p_payload->>'id')::uuid
      and m.empresa_id = v_empresa
    returning m.id into v_id;
  else
    insert into public.financeiro_movimentacoes (
      empresa_id, conta_corrente_id, data_movimento, data_competencia, tipo_mov, valor,
      descricao, documento_ref, origem_tipo, origem_id, categoria, centro_custo, centro_de_custo_id, conciliado, observacoes
    ) values (
      v_empresa,
      v_cc_id,
      coalesce((p_payload->>'data_movimento')::date, current_date),
      (p_payload->>'data_competencia')::date,
      v_tipo,
      v_valor,
      p_payload->>'descricao',
      p_payload->>'documento_ref',
      p_payload->>'origem_tipo',
      nullif(p_payload->>'origem_id','')::uuid,
      p_payload->>'categoria',
      p_payload->>'centro_custo',
      v_centro_id,
      coalesce((p_payload->>'conciliado')::boolean, false),
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] financeiro_movimentacoes_upsert: ' || v_id);
  return public.financeiro_movimentacoes_get(v_id);
end;
$$;

revoke all on function public.financeiro_movimentacoes_upsert(jsonb) from public;
grant execute on function public.financeiro_movimentacoes_upsert(jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) DRE simplificada (gerencial)
-- -----------------------------------------------------------------------------
create or replace function public.financeiro_dre_simplificada(
  p_start_date date default null,
  p_end_date date default null,
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
  v_rows jsonb;
  v_receitas numeric;
  v_despesas numeric;
begin
  if v_empresa is null then
    raise exception '[FIN][DRE] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  perform public.require_permission_for_current_user('relatorios_financeiro','view');
  perform public._fin04_assert_centro_de_custo(p_centro_de_custo_id);

  with base as (
    select
      coalesce(nullif(btrim(m.categoria), ''), 'Sem categoria') as categoria,
      sum(case when m.tipo_mov = 'entrada' then m.valor else 0 end) as receitas,
      sum(case when m.tipo_mov = 'saida' then m.valor else 0 end) as despesas
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and coalesce(m.data_competencia, m.data_movimento) between v_start and v_end
      and (p_centro_de_custo_id is null or m.centro_de_custo_id = p_centro_de_custo_id)
    group by 1
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'categoria', categoria,
        'receitas', receitas,
        'despesas', despesas,
        'resultado', (receitas - despesas)
      )
      order by abs(receitas - despesas) desc, categoria asc
    ), '[]'::jsonb),
    coalesce(sum(receitas), 0),
    coalesce(sum(despesas), 0)
  into v_rows, v_receitas, v_despesas
  from base;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', v_start::text, 'fim', v_end::text),
    'centro_de_custo_id', p_centro_de_custo_id,
    'totais', jsonb_build_object(
      'receitas', v_receitas,
      'despesas', v_despesas,
      'resultado', (v_receitas - v_despesas)
    ),
    'linhas', v_rows
  );
end;
$$;

revoke all on function public.financeiro_dre_simplificada(date, date, uuid) from public;
grant execute on function public.financeiro_dre_simplificada(date, date, uuid) to authenticated, service_role;

commit;

