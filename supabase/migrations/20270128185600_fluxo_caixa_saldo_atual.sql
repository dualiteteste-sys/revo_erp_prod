-- Fix: Incluir saldo atual das contas correntes no fluxo de caixa
-- O saldo acumulado agora começa do saldo_atual de todas as contas_correntes ativas
-- saldo_atual = saldo_inicial + sum(movimentacoes)

begin;

-- 1) RPC auxiliar: retorna a soma dos saldos atuais de todas as contas correntes ativas
create or replace function public.financeiro_saldo_atual_total()
returns numeric
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric;
begin
  select coalesce(sum(
    cc.saldo_inicial
    + coalesce((
        select sum(
          case when m.tipo_mov = 'entrada' then m.valor else -m.valor end
        )
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.conta_corrente_id = cc.id
          and m.data_movimento <= current_date
      ), 0)
  ), 0)
  into v_total
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa and cc.ativo = true;
  
  return v_total;
end;
$$;

comment on function public.financeiro_saldo_atual_total() is 
'Retorna a soma dos saldos atuais (saldo_inicial + movimentacoes) de todas as contas correntes ativas da empresa.';

grant execute on function public.financeiro_saldo_atual_total() to authenticated;

-- 2) Atualiza a RPC de fluxo de caixa para incluir saldo_inicial_cc como primeiro registro
-- Precisa drop primeiro pois mudamos o tipo de retorno
drop function if exists public.financeiro_fluxo_caixa_centered(int);

create or replace function public.financeiro_fluxo_caixa_centered(p_months int)
returns table (
  mes text,
  mes_iso text,
  receber_realizado numeric,
  receber_previsto numeric,
  pagar_realizado numeric,
  pagar_previsto numeric,
  is_past boolean,
  is_current boolean,
  saldo_inicial_cc numeric  -- saldo atual das contas correntes (para inicializar o grafico)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_current_month date := date_trunc('month', current_date);
  v_months_before int;
  v_months_after int;
  v_start date;
  v_end date;
  v_saldo_inicial numeric;
begin
  if v_empresa is null then
    raise exception 'Empresa não identificada';
  end if;

  perform public.require_permission_for_current_user('contas_a_receber', 'view');
  perform public.require_permission_for_current_user('contas_a_pagar', 'view');

  -- Calcula saldo_atual total das contas correntes (saldo_inicial + movimentações)
  -- Mesma lógica usada em financeiro_contas_correntes_list
  select coalesce(sum(
    cc.saldo_inicial
    + coalesce((
        select sum(
          case when m.tipo_mov = 'entrada' then m.valor else -m.valor end
        )
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.conta_corrente_id = cc.id
          and m.data_movimento <= current_date
      ), 0)
  ), 0)
  into v_saldo_inicial
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa and cc.ativo = true;

  v_months_before := p_months / 2;
  v_months_after := p_months - v_months_before - 1;
  
  v_start := v_current_month - (v_months_before || ' months')::interval;
  v_end := v_current_month + (v_months_after || ' months')::interval + interval '1 month' - interval '1 day';

  return query
  with meses as (
    select 
      to_char(d, 'Mon/YY') as mes_label,
      to_char(d, 'YYYY-MM') as mes_iso,
      d < v_current_month as is_past,
      d = v_current_month as is_current,
      row_number() over (order by d) as rn
    from generate_series(v_start, v_end, '1 month') as d
  ),
  titulos_receber as (
    select
      to_char(c.data_vencimento, 'YYYY-MM') as mes_iso,
      sum(case when c.status = 'pago'::public.status_conta_receber then coalesce(c.valor_pago, c.valor) else 0 end) as realizado,
      sum(case when c.status in ('pendente'::public.status_conta_receber, 'vencido'::public.status_conta_receber) then greatest(coalesce(c.valor, 0) - coalesce(c.valor_pago, 0), 0) else 0 end) as previsto
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status <> 'cancelado'::public.status_conta_receber
      and c.data_vencimento between v_start and v_end
    group by 1
  ),
  titulos_pagar as (
    select
      to_char(cp.data_vencimento, 'YYYY-MM') as mes_iso,
      sum(case when cp.status = 'paga' then coalesce(cp.valor_pago, cp.valor_total) else 0 end) as realizado,
      sum(case when cp.status in ('aberta', 'parcial') then greatest(coalesce(cp.valor_total, 0) - coalesce(cp.valor_pago, 0), 0) else 0 end) as previsto
    from public.financeiro_contas_pagar cp
    where cp.empresa_id = v_empresa
      and cp.data_vencimento between v_start and v_end
    group by 1
  )
  select
    m.mes_label::text,
    m.mes_iso::text,
    coalesce(tr.realizado, 0)::numeric as receber_realizado,
    coalesce(tr.previsto, 0)::numeric as receber_previsto,
    coalesce(tp.realizado, 0)::numeric as pagar_realizado,
    coalesce(tp.previsto, 0)::numeric as pagar_previsto,
    m.is_past,
    m.is_current,
    -- Retorna saldo inicial apenas no primeiro registro (para o frontend inicializar)
    case when m.rn = 1 then v_saldo_inicial else 0 end::numeric as saldo_inicial_cc
  from meses m
  left join titulos_receber tr on tr.mes_iso = m.mes_iso
  left join titulos_pagar tp on tp.mes_iso = m.mes_iso
  order by m.mes_iso;
end;
$$;

comment on function public.financeiro_fluxo_caixa_centered(int) is 
'Fluxo de caixa centralizado no mes atual. Inclui saldo atual das contas correntes no primeiro registro para calculo do saldo acumulado.';

commit;
