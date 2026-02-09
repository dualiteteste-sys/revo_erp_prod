begin;

/*
  Hotfix: transferência interna grava duas movimentações (saída e entrada).
  A idempotência global de financeiro_movimentacoes usa unique (empresa_id, origem_tipo, origem_id),
  portanto precisamos usar origem_tipo distinto por perna para não colidir.
*/

drop function if exists public.financeiro_transferencias_internas_criar(uuid, uuid, numeric, date, text, text, uuid, text);

create or replace function public.financeiro_transferencias_internas_criar(
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_valor numeric,
  p_data_movimento date default current_date,
  p_descricao text default null,
  p_documento_ref text default null,
  p_centro_de_custo_id uuid default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_transferencia_id uuid := gen_random_uuid();
  v_mov_saida_id uuid;
  v_mov_entrada_id uuid;
  v_origem_nome text;
  v_destino_nome text;
  v_origem_permite_saldo_negativo boolean := false;
  v_saldo_origem numeric := 0;
  v_data date := coalesce(p_data_movimento, current_date);
  v_descricao_saida text;
  v_descricao_entrada text;
begin
  perform public.require_permission_for_current_user('tesouraria', 'create');

  if p_conta_origem_id is null then
    raise exception 'conta de origem é obrigatória.';
  end if;

  if p_conta_destino_id is null then
    raise exception 'conta de destino é obrigatória.';
  end if;

  if p_conta_origem_id = p_conta_destino_id then
    raise exception 'selecione contas diferentes para origem e destino.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'valor inválido. Informe um valor maior que zero.';
  end if;

  perform public._fin04_assert_centro_de_custo(p_centro_de_custo_id);

  perform 1
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa
    and cc.id in (p_conta_origem_id, p_conta_destino_id)
  order by cc.id
  for update;

  select cc.nome, cc.permite_saldo_negativo
    into v_origem_nome, v_origem_permite_saldo_negativo
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa
    and cc.id = p_conta_origem_id;

  if not found then
    raise exception 'conta de origem não encontrada para a empresa atual.';
  end if;

  select cc.nome
    into v_destino_nome
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa
    and cc.id = p_conta_destino_id;

  if not found then
    raise exception 'conta de destino não encontrada para a empresa atual.';
  end if;

  if not v_origem_permite_saldo_negativo then
    select
      cc.saldo_inicial
      + coalesce((
          select sum(
            case when m.tipo_mov = 'entrada' then m.valor else -m.valor end
          )
          from public.financeiro_movimentacoes m
          where m.empresa_id = v_empresa
            and m.conta_corrente_id = cc.id
            and m.data_movimento <= v_data
      ), 0)
    into v_saldo_origem
    from public.financeiro_contas_correntes cc
    where cc.empresa_id = v_empresa
      and cc.id = p_conta_origem_id;

    v_saldo_origem := coalesce(v_saldo_origem, 0);

    if (v_saldo_origem - p_valor) < 0 then
      raise exception 'saldo insuficiente na conta de origem. Ative "Permitir saldo negativo" para essa conta ou reduza o valor.';
    end if;
  end if;

  v_descricao_saida := coalesce(nullif(trim(p_descricao), ''), format('Transferência para %s', v_destino_nome));
  v_descricao_entrada := coalesce(nullif(trim(p_descricao), ''), format('Transferência recebida de %s', v_origem_nome));

  insert into public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_de_custo_id,
    conciliado,
    observacoes
  ) values (
    v_empresa,
    p_conta_origem_id,
    v_data,
    'saida',
    p_valor,
    v_descricao_saida,
    nullif(trim(p_documento_ref), ''),
    'transferencia_interna_saida',
    v_transferencia_id,
    'Transferência entre contas',
    p_centro_de_custo_id,
    false,
    nullif(trim(p_observacoes), '')
  )
  returning id into v_mov_saida_id;

  insert into public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_de_custo_id,
    conciliado,
    observacoes
  ) values (
    v_empresa,
    p_conta_destino_id,
    v_data,
    'entrada',
    p_valor,
    v_descricao_entrada,
    nullif(trim(p_documento_ref), ''),
    'transferencia_interna_entrada',
    v_transferencia_id,
    'Transferência entre contas',
    p_centro_de_custo_id,
    false,
    nullif(trim(p_observacoes), '')
  )
  returning id into v_mov_entrada_id;

  perform pg_notify('app_log', '[RPC] financeiro_transferencias_internas_criar: ' || v_transferencia_id::text);

  return jsonb_build_object(
    'transferencia_id', v_transferencia_id,
    'movimentacao_saida_id', v_mov_saida_id,
    'movimentacao_entrada_id', v_mov_entrada_id,
    'conta_origem_id', p_conta_origem_id,
    'conta_destino_id', p_conta_destino_id,
    'valor', p_valor,
    'data_movimento', v_data
  );
end;
$$;

revoke all on function public.financeiro_transferencias_internas_criar(uuid, uuid, numeric, date, text, text, uuid, text) from public;
grant execute on function public.financeiro_transferencias_internas_criar(uuid, uuid, numeric, date, text, text, uuid, text) to authenticated, service_role;

commit;
