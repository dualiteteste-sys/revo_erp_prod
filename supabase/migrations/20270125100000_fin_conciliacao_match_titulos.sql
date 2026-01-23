/*
  Financeiro / Tesouraria — Conciliação “estado da arte” (MVP seguro)
  - Sugestões e busca manual de títulos (contas a pagar / receber) para conciliar com extrato
  - Conciliação 1→1: baixa (pagar/receber) + cria movimentação + vincula ao extrato
  - Tudo via RPC (RPC-first), sem acesso direto às tabelas pelo frontend
*/

begin;

-- =============================================================================
-- 1) Sugestões (auto-match) para um item de extrato
-- =============================================================================

drop function if exists public.financeiro_conciliacao_titulos_sugerir(uuid, int);
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
    -- Contas a pagar (saída)
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
          -- score simples, determinístico e seguro:
          (case when abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - v_valor) < 0.005 then 60
                when abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - v_valor) <= 0.01 then 55
                when abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - v_valor) <= greatest(0.05, v_valor * 0.005) then 40
                else 0 end
          )
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
             when v_extrato.documento_ref is not null and cp.documento_ref is not null and btrim(v_extrato.documento_ref) <> '' and cp.documento_ref = v_extrato.documento_ref then 5
             else 0
           end)
          +
          (case
             when p.nome is not null and btrim(p.nome) <> '' and position(lower(p.nome) in lower(v_extrato.descricao)) > 0 then 5
             else 0
           end)
        )::int as score
      from public.financeiro_contas_pagar cp
      left join public.pessoas p on p.id = cp.fornecedor_id
      where cp.empresa_id = v_empresa
        and cp.status in ('aberta','parcial')
        and cp.data_vencimento between v_start and v_end
        and ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) > 0
        and abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - v_valor) <= greatest(1.00, v_valor * 0.05)
    )
    select *
    from base
    order by score desc, abs(saldo_aberto - v_valor) asc, data_vencimento asc
    limit greatest(1, p_limit);
  else
    -- Contas a receber (entrada)
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
          (case when abs((cr.valor - coalesce(cr.valor_pago, 0)) - v_valor) < 0.005 then 60
                when abs((cr.valor - coalesce(cr.valor_pago, 0)) - v_valor) <= 0.01 then 55
                when abs((cr.valor - coalesce(cr.valor_pago, 0)) - v_valor) <= greatest(0.05, v_valor * 0.005) then 40
                else 0 end
          )
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
             when p.nome is not null and btrim(p.nome) <> '' and position(lower(p.nome) in lower(v_extrato.descricao)) > 0 then 10
             else 0
           end)
        )::int as score
      from public.contas_a_receber cr
      left join public.pessoas p on p.id = cr.cliente_id
      where cr.empresa_id = v_empresa
        and cr.status in ('pendente','vencido')
        and cr.data_vencimento between v_start and v_end
        and (cr.valor - coalesce(cr.valor_pago, 0)) > 0
        and abs((cr.valor - coalesce(cr.valor_pago, 0)) - v_valor) <= greatest(1.00, v_valor * 0.05)
    )
    select *
    from base
    order by score desc, abs(saldo_aberto - v_valor) asc, data_vencimento asc
    limit greatest(1, p_limit);
  end if;
end;
$$;

revoke all on function public.financeiro_conciliacao_titulos_sugerir(uuid, int) from public, anon;
grant execute on function public.financeiro_conciliacao_titulos_sugerir(uuid, int) to authenticated, service_role;

-- =============================================================================
-- 2) Busca manual de títulos (fallback)
-- =============================================================================

drop function if exists public.financeiro_conciliacao_titulos_search(text, numeric, date, date, text, int, int);
create or replace function public.financeiro_conciliacao_titulos_search(
  p_tipo text, -- 'pagar' | 'receber'
  p_valor numeric default null,
  p_start_date date default null,
  p_end_date date default null,
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  tipo text,
  titulo_id uuid,
  pessoa_nome text,
  descricao text,
  documento_ref text,
  data_vencimento date,
  valor_total numeric,
  valor_pago numeric,
  saldo_aberto numeric,
  status text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_lim int := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off int := greatest(0, coalesce(p_offset, 0));
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');
  perform public.require_permission_for_current_user('financeiro', 'view');

  if p_tipo not in ('pagar','receber') then
    raise exception 'p_tipo inválido. Use pagar|receber.' using errcode = 'P0001';
  end if;

  if p_tipo = 'pagar' then
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
        cp.status::text as status
      from public.financeiro_contas_pagar cp
      left join public.pessoas p on p.id = cp.fornecedor_id
      where cp.empresa_id = v_empresa
        and cp.status in ('aberta','parcial')
        and (p_start_date is null or cp.data_vencimento >= p_start_date)
        and (p_end_date is null or cp.data_vencimento <= p_end_date)
        and (p_q is null or (
          cp.descricao ilike '%'||p_q||'%' or
          cp.documento_ref ilike '%'||p_q||'%' or
          p.nome ilike '%'||p_q||'%'
        ))
        and (p_valor is null or abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - p_valor) <= greatest(1.00, p_valor * 0.05))
    ), counted as (
      select *, count(*) over() as total_count
      from base
    )
    select *
    from counted
    order by data_vencimento asc, saldo_aberto asc, pessoa_nome asc
    limit v_lim offset v_off;
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
        cr.status::text as status
      from public.contas_a_receber cr
      left join public.pessoas p on p.id = cr.cliente_id
      where cr.empresa_id = v_empresa
        and cr.status in ('pendente','vencido')
        and (p_start_date is null or cr.data_vencimento >= p_start_date)
        and (p_end_date is null or cr.data_vencimento <= p_end_date)
        and (p_q is null or (
          cr.descricao ilike '%'||p_q||'%' or
          p.nome ilike '%'||p_q||'%'
        ))
        and (p_valor is null or abs((cr.valor - coalesce(cr.valor_pago, 0)) - p_valor) <= greatest(1.00, p_valor * 0.05))
    ), counted as (
      select *, count(*) over() as total_count
      from base
    )
    select *
    from counted
    order by data_vencimento asc, saldo_aberto asc, pessoa_nome asc
    limit v_lim offset v_off;
  end if;
end;
$$;

revoke all on function public.financeiro_conciliacao_titulos_search(text, numeric, date, date, text, int, int) from public, anon;
grant execute on function public.financeiro_conciliacao_titulos_search(text, numeric, date, date, text, int, int) to authenticated, service_role;

-- =============================================================================
-- 3) Conciliar extrato com título (cria movimentação via pagar/receber e vincula ao extrato)
-- =============================================================================

drop function if exists public.financeiro_conciliacao_conciliar_extrato_com_titulo(uuid, text, uuid);
create or replace function public.financeiro_conciliacao_conciliar_extrato_com_titulo(
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
    raise exception 'Extrato já conciliado.' using errcode = 'P0001';
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

    -- MVP seguro: só concilia automaticamente quando o valor bate (evita marcar como paga incorretamente).
    if abs(v_total - v_extrato.valor) > 0.01 then
      raise exception 'Valor do extrato não confere com o saldo do título. Use busca manual e/ou crie movimentação.' using errcode = 'P0001';
    end if;

    perform public.financeiro_conta_pagar_pagar_v2(p_titulo_id, v_extrato.data_lancamento, v_extrato.valor, v_extrato.conta_corrente_id);

    select m.id
      into v_mov_id
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.origem_tipo = 'conta_a_pagar'
      and m.origem_id = p_titulo_id
    order by m.created_at desc, m.id desc
    limit 1;
  else
    select (cr.valor - coalesce(cr.valor_pago,0))
      into v_total
    from public.contas_a_receber cr
    where cr.id = p_titulo_id
      and cr.empresa_id = v_empresa;

    if v_total is null then
      raise exception 'Conta a receber não encontrada.' using errcode = 'P0001';
    end if;

    if abs(v_total - v_extrato.valor) > 0.01 then
      raise exception 'Valor do extrato não confere com o saldo do título. Use busca manual e/ou crie movimentação.' using errcode = 'P0001';
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

revoke all on function public.financeiro_conciliacao_conciliar_extrato_com_titulo(uuid, text, uuid) from public, anon;
grant execute on function public.financeiro_conciliacao_conciliar_extrato_com_titulo(uuid, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

