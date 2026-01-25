/*
  Fix: financeiro_conciliacao_* — evitar ambiguidade com variável de retorno `saldo_aberto`
  Erro observado em PROD:
    rpc:financeiro_conciliacao_titulos_sugerir: column reference "saldo_aberto" is ambiguous (42702)
  Causa:
    Em PL/pgSQL, colunas do RETURNS TABLE viram variáveis; dentro do SQL, `saldo_aberto`
    conflita com a coluna homônima do CTE.
  Solução:
    Qualificar `saldo_aberto` no ORDER BY (base.saldo_aberto) e também na busca manual.
*/

begin;

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
    order by score desc, abs(base.saldo_aberto - v_valor) asc, data_vencimento asc
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
    order by score desc, abs(base.saldo_aberto - v_valor) asc, data_vencimento asc
    limit greatest(1, p_limit);
  end if;
end;
$$;

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
    order by data_vencimento asc, counted.saldo_aberto asc, pessoa_nome asc
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
    order by data_vencimento asc, counted.saldo_aberto asc, pessoa_nome asc
    limit v_lim offset v_off;
  end if;
end;
$$;

commit;

