-- Migration: Harden dashboard widget RPCs (permission guard)

begin;

create or replace function public.financeiro_fluxo_caixa_custom(p_months int)
returns table (
  mes text,
  receber numeric,
  pagar numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date;
  v_end date := date_trunc('month', current_date) + interval '1 month' - interval '1 day';
begin
  if v_empresa is null then
    raise exception 'Empresa não identificada';
  end if;

  perform public.require_permission_for_current_user('financeiro', 'view');

  v_start := date_trunc('month', current_date) - (p_months - 1 || ' months')::interval;

  return query
  with meses as (
    select to_char(d, 'YYYY-MM') as mes_iso, to_char(d, 'Mon') as mes_label
    from generate_series(v_start, v_end, '1 month') as d
  ),
  movs as (
    select
      to_char(coalesce(data_competencia, data_movimento), 'YYYY-MM') as mes_iso,
      tipo_mov,
      sum(valor) as total
    from public.financeiro_movimentacoes
    where empresa_id = v_empresa
      and coalesce(data_competencia, data_movimento) between v_start and v_end
    group by 1, 2
  )
  select
    m.mes_label::text,
    coalesce(r.total, 0),
    coalesce(p.total, 0)
  from meses m
  left join movs r on r.mes_iso = m.mes_iso and r.tipo_mov = 'entrada'
  left join movs p on p.mes_iso = m.mes_iso and p.tipo_mov = 'saida'
  order by m.mes_iso;
end;
$$;

create or replace function public.financeiro_alertas_vencimentos()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_atrasado_receber_qtd int;
  v_atrasado_receber_valor numeric;
  v_atrasado_pagar_qtd int;
  v_atrasado_pagar_valor numeric;

  v_hoje_receber_qtd int;
  v_hoje_receber_valor numeric;
  v_hoje_pagar_qtd int;
  v_hoje_pagar_valor numeric;
begin
  if v_empresa is null then
    raise exception 'Empresa não identificada';
  end if;

  perform public.require_permission_for_current_user('financeiro', 'view');

  select count(*), coalesce(sum(valor_restante), 0)
  into v_atrasado_receber_qtd, v_atrasado_receber_valor
  from public.financeiro_titulos
  where empresa_id = v_empresa
    and tipo = 'receber'
    and status = 'aberto'
    and data_vencimento < current_date;

  select count(*), coalesce(sum(valor_restante), 0)
  into v_atrasado_pagar_qtd, v_atrasado_pagar_valor
  from public.financeiro_titulos
  where empresa_id = v_empresa
    and tipo = 'pagar'
    and status = 'aberto'
    and data_vencimento < current_date;

  select count(*), coalesce(sum(valor_restante), 0)
  into v_hoje_receber_qtd, v_hoje_receber_valor
  from public.financeiro_titulos
  where empresa_id = v_empresa
    and tipo = 'receber'
    and status = 'aberto'
    and data_vencimento = current_date;

  select count(*), coalesce(sum(valor_restante), 0)
  into v_hoje_pagar_qtd, v_hoje_pagar_valor
  from public.financeiro_titulos
  where empresa_id = v_empresa
    and tipo = 'pagar'
    and status = 'aberto'
    and data_vencimento = current_date;

  return jsonb_build_object(
    'atrasados', jsonb_build_object(
      'receber', jsonb_build_object('qtd', v_atrasado_receber_qtd, 'valor', v_atrasado_receber_valor),
      'pagar', jsonb_build_object('qtd', v_atrasado_pagar_qtd, 'valor', v_atrasado_pagar_valor)
    ),
    'hoje', jsonb_build_object(
      'receber', jsonb_build_object('qtd', v_hoje_receber_qtd, 'valor', v_hoje_receber_valor),
      'pagar', jsonb_build_object('qtd', v_hoje_pagar_qtd, 'valor', v_hoje_pagar_valor)
    )
  );
end;
$$;

commit;

