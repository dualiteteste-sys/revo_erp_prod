-- Fix: conciliar_extrato_com_titulo_parcial for tipo='receber'
-- The movimentação lookup used wrong origem_tipo ('conta_a_receber' instead of
-- 'conta_a_receber_recebimento') and wrong join (direct origem_id = titulo_id
-- instead of joining via recebimentos table).
-- Mirrors the correct pattern from conciliar_extrato_com_titulo (non-parcial).

create or replace function public.financeiro_conciliacao_conciliar_extrato_com_titulo_parcial(
  p_extrato_id uuid,
  p_tipo text, -- 'pagar' | 'receber'
  p_titulo_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov_id uuid;
  v_total numeric;
  v_res jsonb;
begin
  perform public.require_permission_for_current_user('tesouraria', 'update');
  perform public.require_permission_for_current_user('financeiro', 'update');

  if p_tipo not in ('pagar','receber') then
    raise exception 'p_tipo inválido. Use pagar|receber.' using errcode = 'P0001';
  end if;

  select *
    into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.' using errcode = 'P0001';
  end if;

  if coalesce(v_extrato.conciliado, false) is true then
    if v_extrato.movimentacao_id is not null then
      return v_extrato.movimentacao_id;
    end if;
    raise exception 'Extrato já conciliado.' using errcode = 'P0001';
  end if;

  if v_extrato.valor <= 0 then
    raise exception 'Valor do extrato inválido.' using errcode = 'P0001';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and p_tipo <> 'pagar' then
    raise exception 'Extrato (débito) só pode conciliar com título a pagar.' using errcode = 'P0001';
  end if;
  if v_extrato.tipo_lancamento = 'credito' and p_tipo <> 'receber' then
    raise exception 'Extrato (crédito) só pode conciliar com título a receber.' using errcode = 'P0001';
  end if;

  if p_tipo = 'pagar' then
    select (cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago,0)
      into v_total
    from public.financeiro_contas_pagar cp
    where cp.id = p_titulo_id
      and cp.empresa_id = v_empresa;

    if v_total is null then
      raise exception 'Conta a pagar não encontrada.' using errcode = 'P0001';
    end if;

    if (v_extrato.valor - v_total) > 0.01 then
      raise exception 'Valor do extrato é maior que o saldo do título. Selecione mais títulos ou ajuste.' using errcode = 'P0001';
    end if;

    select public.financeiro_conta_pagar_pagar_v2(p_titulo_id, v_extrato.data_lancamento, v_extrato.valor, v_extrato.conta_corrente_id)
      into v_res;

    v_mov_id := nullif(v_res->>'movimentacao_id','')::uuid;
    if v_mov_id is null then
      select m.id
        into v_mov_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_pagar'
        and m.origem_id = p_titulo_id
      order by m.created_at desc, m.id desc
      limit 1;
    end if;
  else
    select (cr.valor - coalesce(cr.valor_pago,0))
      into v_total
    from public.contas_a_receber cr
    where cr.id = p_titulo_id
      and cr.empresa_id = v_empresa;

    if v_total is null then
      raise exception 'Conta a receber não encontrada.' using errcode = 'P0001';
    end if;

    if (v_extrato.valor - v_total) > 0.01 then
      raise exception 'Valor do extrato é maior que o saldo do título. Selecione mais títulos ou ajuste.' using errcode = 'P0001';
    end if;

    perform public.financeiro_conta_a_receber_receber_v2(p_titulo_id, v_extrato.data_lancamento, v_extrato.valor, v_extrato.conta_corrente_id);

    -- Fixed: join via recebimentos table to find the movimentação.
    -- The movimentação is created with origem_tipo='conta_a_receber_recebimento'
    -- and origem_id=recebimento_id (NOT the conta_a_receber id).
    select m.id
      into v_mov_id
    from public.financeiro_movimentacoes m
    join public.financeiro_contas_a_receber_recebimentos r
      on r.id = m.origem_id
     and m.origem_tipo = 'conta_a_receber_recebimento'
    where r.empresa_id = v_empresa
      and r.conta_a_receber_id = p_titulo_id
    order by r.created_at desc, m.created_at desc
    limit 1;

    -- Fallback: legacy movimentações with direct origem_tipo='conta_a_receber'
    if v_mov_id is null then
      select m.id
        into v_mov_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_receber'
        and m.origem_id = p_titulo_id
      order by m.created_at desc, m.id desc
      limit 1;
    end if;
  end if;

  if v_mov_id is null then
    raise exception 'Falha ao localizar movimentação gerada para conciliação.' using errcode = 'P0001';
  end if;

  perform public.financeiro_extratos_bancarios_vincular_movimentacao(p_extrato_id, v_mov_id);
  return v_mov_id;
end;
$$;

revoke all on function public.financeiro_conciliacao_conciliar_extrato_com_titulo_parcial(uuid, text, uuid) from public, anon;
grant execute on function public.financeiro_conciliacao_conciliar_extrato_com_titulo_parcial(uuid, text, uuid) to authenticated, service_role;
