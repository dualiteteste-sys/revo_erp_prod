begin;

-- -----------------------------------------------------------------------------
-- Conciliação (UX): sugestões automáticas devem ser somente "valor exato"
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conciliacao_titulos_sugerir(
  p_extrato_id uuid,
  p_limit int default 10
)
returns table (
  tipo text, -- 'pagar' | 'receber'
  titulo_id uuid,
  pessoa_nome text,
  descricao text,
  documento_ref text,
  data_vencimento date,
  valor_total numeric,
  valor_pago numeric,
  saldo_aberto numeric,
  status text,
  score int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_dt date;
  v_valor numeric;
  v_tipo text;
  v_start date;
  v_end date;
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');
  perform public.require_permission_for_current_user('financeiro', 'view');

  select *
    into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.' using errcode = 'P0001';
  end if;

  v_dt := v_extrato.data_lancamento;
  v_valor := v_extrato.valor;
  v_tipo := v_extrato.tipo_lancamento;
  v_start := (v_dt - interval '5 days')::date;
  v_end := (v_dt + interval '5 days')::date;

  if v_tipo = 'debito' then
    return query
    with base as (
      select
        'pagar'::text as tipo,
        cp.id as titulo_id,
        coalesce(p.nome, '—') as pessoa_nome,
        cp.descricao,
        cp.documento_ref,
        cp.data_vencimento,
        (cp.valor_total + cp.multa + cp.juros - cp.desconto) as valor_total,
        coalesce(cp.valor_pago, 0) as valor_pago,
        ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) as saldo_aberto,
        cp.status::text as status,
        (
          60
          +
          (case
             when cp.data_vencimento = v_dt then 20
             when abs((cp.data_vencimento - v_dt)) = 1 then 16
             when abs((cp.data_vencimento - v_dt)) = 2 then 12
             when abs((cp.data_vencimento - v_dt)) = 3 then 8
             when abs((cp.data_vencimento - v_dt)) = 4 then 4
             else 0
           end)
          +
          (case
             when v_extrato.documento_ref is not null
              and cp.documento_ref is not null
              and btrim(v_extrato.documento_ref) <> ''
              and cp.documento_ref = v_extrato.documento_ref then 5
             else 0
           end)
          +
          (case
             when p.nome is not null
              and btrim(p.nome) <> ''
              and position(lower(p.nome) in lower(v_extrato.descricao)) > 0 then 5
             else 0
           end)
        )::int as score
      from public.financeiro_contas_pagar cp
      left join public.pessoas p on p.id = cp.fornecedor_id
      where cp.empresa_id = v_empresa
        and cp.status in ('aberta','parcial')
        and cp.data_vencimento between v_start and v_end
        and ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) > 0
        -- Estado da arte: sugestões automáticas só de valor exato (o restante fica na busca manual)
        and abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - v_valor) <= 0.01
    )
    select *
    from base
    order by score desc, data_vencimento asc
    limit greatest(1, p_limit);
  else
    return query
    with base as (
      select
        'receber'::text as tipo,
        cr.id as titulo_id,
        coalesce(p.nome, '—') as pessoa_nome,
        cr.descricao,
        null::text as documento_ref,
        cr.data_vencimento,
        cr.valor as valor_total,
        coalesce(cr.valor_pago, 0) as valor_pago,
        (cr.valor - coalesce(cr.valor_pago, 0)) as saldo_aberto,
        cr.status::text as status,
        (
          60
          +
          (case
             when cr.data_vencimento = v_dt then 20
             when abs((cr.data_vencimento - v_dt)) = 1 then 16
             when abs((cr.data_vencimento - v_dt)) = 2 then 12
             when abs((cr.data_vencimento - v_dt)) = 3 then 8
             when abs((cr.data_vencimento - v_dt)) = 4 then 4
             else 0
           end)
          +
          (case
             when p.nome is not null
              and btrim(p.nome) <> ''
              and position(lower(p.nome) in lower(v_extrato.descricao)) > 0 then 10
             else 0
           end)
        )::int as score
      from public.contas_a_receber cr
      left join public.pessoas p on p.id = cr.cliente_id
      where cr.empresa_id = v_empresa
        and cr.status in ('pendente','vencido','parcial')
        and cr.data_vencimento between v_start and v_end
        and (cr.valor - coalesce(cr.valor_pago, 0)) > 0
        and abs((cr.valor - coalesce(cr.valor_pago, 0)) - v_valor) <= 0.01
    )
    select *
    from base
    order by score desc, data_vencimento asc
    limit greatest(1, p_limit);
  end if;
end;
$$;

revoke all on function public.financeiro_conciliacao_titulos_sugerir(uuid, int) from public, anon;
grant execute on function public.financeiro_conciliacao_titulos_sugerir(uuid, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Conciliação (UX): permitir conciliar extrato com título via pagamento/recebimento parcial
-- (quando valor do extrato < saldo do título)
-- -----------------------------------------------------------------------------

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

  -- Idempotência de retry (não cria outro pagamento se já conciliou)
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

    select m.id
      into v_mov_id
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.origem_tipo = 'conta_a_receber'
      and m.origem_id = p_titulo_id
    order by m.created_at desc, m.id desc
    limit 1;
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

notify pgrst, 'reload schema';
commit;

