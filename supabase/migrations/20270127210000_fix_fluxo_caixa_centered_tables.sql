-- Fix: Corrigir tabelas do fluxo de caixa centralizado
-- Tabelas corretas: contas_a_receber e financeiro_contas_pagar
-- Status receber: 'pendente', 'pago', 'vencido', 'cancelado'
-- Status pagar: 'aberta', 'parcial', 'paga'

begin;

create or replace function public.financeiro_fluxo_caixa_centered(p_months int)
returns table (
  mes text,
  mes_iso text,
  receber_realizado numeric,
  receber_previsto numeric,
  pagar_realizado numeric,
  pagar_previsto numeric,
  is_past boolean,
  is_current boolean
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
begin
  if v_empresa is null then
    raise exception 'Empresa não identificada';
  end if;

  perform public.require_permission_for_current_user('contas_a_receber', 'view');
  perform public.require_permission_for_current_user('contas_a_pagar', 'view');

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
      d = v_current_month as is_current
    from generate_series(v_start, v_end, '1 month') as d
  ),
  -- Contas a receber (tabela: contas_a_receber)
  -- Status: 'pendente', 'pago', 'vencido', 'cancelado'
  -- Realizado = pago, Previsto = pendente ou vencido
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
  -- Contas a pagar (tabela: financeiro_contas_pagar)
  -- Status: 'aberta', 'parcial', 'paga'
  -- Realizado = paga, Previsto = aberta ou parcial
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
    m.is_current
  from meses m
  left join titulos_receber tr on tr.mes_iso = m.mes_iso
  left join titulos_pagar tp on tp.mes_iso = m.mes_iso
  order by m.mes_iso;
end;
$$;

comment on function public.financeiro_fluxo_caixa_centered(int) is 
'Fluxo de caixa centralizado no mes atual. Retorna realizados (pagos/recebidos) e previstos (a pagar/receber) separados.';

commit;
