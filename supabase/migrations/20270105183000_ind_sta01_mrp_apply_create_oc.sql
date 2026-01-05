/*
  IND-STA-01: MRP “operável” — aplicar sugestão criando OC (rascunho) a partir de uma demanda.

  Motivo
  - Hoje o MRP registra ações (transferência/RC/OC) como histórico, mas não cria um artefato executável.
  - Para reduzir suporte, o usuário precisa conseguir “aplicar” uma sugestão e já sair com uma OC em rascunho.

  O que muda
  - RPC `mrp_criar_oc_para_demanda`:
    - Usa fornecedor preferencial do parâmetro MRP do produto.
    - Cria OC rascunho + item (qtd arredondada por lote mínimo/múltiplo).
    - Registra ação MRP com detalhes (id/numero da OC) e fecha a demanda.
    - Idempotente por demanda (se já existir OC registrada, retorna a mesma).

  Reversibilidade
  - Função nova. Reversão = drop function.
*/

begin;

create or replace function public.mrp_criar_oc_para_demanda(
  p_demanda_id uuid,
  p_preco_unitario numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_dem record;
  v_params record;
  v_existing jsonb;
  v_qtd numeric;
  v_lote_min numeric;
  v_mult numeric;
  v_fornecedor_id uuid;
  v_oc jsonb;
  v_oc_id uuid;
  v_oc_num bigint;
  v_obs text;
begin
  perform public.require_permission_for_current_user('mrp','update');
  perform public.require_permission_for_current_user('suprimentos','update');

  if v_emp is null then
    raise exception '[MRP][OC] Nenhuma empresa ativa' using errcode='42501';
  end if;

  if p_demanda_id is null then
    raise exception '[MRP][OC] demanda_id é obrigatório' using errcode='22004';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_demanda_id::text, 0));

  -- Idempotência: se já existe ação OC vinculada, retorna.
  select a.detalhes
    into v_existing
    from public.industria_mrp_demanda_acoes a
   where a.empresa_id = v_emp
     and a.demanda_id = p_demanda_id
     and a.tipo = 'ordem_compra'
     and (a.detalhes ? 'compra_pedido_id')
   order by a.created_at desc
   limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true,
      'already_exists', true,
      'compra_pedido_id', nullif(v_existing->>'compra_pedido_id','')::uuid,
      'compra_pedido_numero', nullif(v_existing->>'compra_pedido_numero','')::bigint
    );
  end if;

  select *
    into v_dem
    from public.industria_mrp_demandas d
   where d.id = p_demanda_id
     and d.empresa_id = v_emp
   for update;

  if not found then
    raise exception '[MRP][OC] Demanda não encontrada' using errcode='P0002';
  end if;

  if coalesce(v_dem.necessidade_liquida,0) <= 0 then
    raise exception '[MRP][OC] Demanda sem necessidade líquida' using errcode='22023';
  end if;

  select *
    into v_params
    from public.industria_mrp_parametros mp
   where mp.empresa_id = v_emp
     and mp.produto_id = v_dem.produto_id;

  v_fornecedor_id := v_params.fornecedor_preferencial_id;
  if v_fornecedor_id is null then
    raise exception '[MRP][OC] Defina o fornecedor preferencial do item (Parâmetros MRP).' using errcode='22023';
  end if;

  v_lote_min := coalesce(v_params.lote_minimo, 0);
  v_mult := greatest(coalesce(v_params.multiplo_compra, 1), 1);

  v_qtd := greatest(coalesce(v_dem.necessidade_liquida,0), v_lote_min);
  -- arredonda para múltiplo
  v_qtd := ceil(v_qtd / v_mult) * v_mult;

  v_obs := format(
    'Gerado pelo MRP. demanda_id=%s; op=%s; componente_id=%s; necessidade=%s',
    v_dem.id,
    coalesce(v_dem.ordem_id::text,'-'),
    coalesce(v_dem.componente_id::text,'-'),
    v_dem.necessidade_liquida
  );

  -- Cria OC rascunho usando a RPC padrão de compras.
  v_oc := public.compras_upsert_pedido(
    jsonb_build_object(
      'fornecedor_id', v_fornecedor_id,
      'status', 'rascunho',
      'data_emissao', current_date,
      'data_prevista', coalesce(v_dem.data_necessidade, (current_date + (coalesce(v_dem.lead_time_dias,0) || ' day')::interval)::date),
      'frete', 0,
      'desconto', 0,
      'observacoes', v_obs
    )
  );

  v_oc_id := nullif(v_oc->>'id','')::uuid;
  v_oc_num := nullif(v_oc->>'numero','')::bigint;

  if v_oc_id is null then
    raise exception '[MRP][OC] Falha ao criar OC' using errcode='P0001';
  end if;

  perform public.compras_manage_item(v_oc_id, null, v_dem.produto_id, v_qtd, coalesce(p_preco_unitario,0), 'upsert');

  insert into public.industria_mrp_demanda_acoes (
    empresa_id, demanda_id, tipo, quantidade, unidade, fornecedor_id, data_prometida, observacoes, detalhes, usuario_id
  )
  values (
    v_emp,
    v_dem.id,
    'ordem_compra',
    v_qtd,
    'un',
    v_fornecedor_id,
    coalesce(v_dem.data_necessidade, current_date),
    'OC criada automaticamente pelo MRP',
    jsonb_build_object(
      'necessidade_liquida', v_dem.necessidade_liquida,
      'origem', v_dem.origem,
      'compra_pedido_id', v_oc_id,
      'compra_pedido_numero', v_oc_num
    ),
    auth.uid()
  );

  update public.industria_mrp_demandas
     set status = 'fechada',
         updated_at = now()
   where id = v_dem.id
     and empresa_id = v_emp;

  return jsonb_build_object(
    'ok', true,
    'already_exists', false,
    'compra_pedido_id', v_oc_id,
    'compra_pedido_numero', v_oc_num,
    'quantidade', v_qtd
  );
end;
$$;

revoke all on function public.mrp_criar_oc_para_demanda(uuid, numeric) from public;
grant execute on function public.mrp_criar_oc_para_demanda(uuid, numeric) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

