-- Financeiro: Contas a Pagar — summary deve somar valores (não contar registros)
-- Ajusta `financeiro_contas_pagar_summary` para retornar somatórios (saldo/pago) por status.

begin;

create or replace function public.financeiro_contas_pagar_summary(
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_abertas numeric := 0;
  v_parciais numeric := 0;
  v_pagas numeric := 0;
  v_vencidas numeric := 0;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','view');

  select
    coalesce(sum(case when cp.status = 'aberta' then ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago) else 0 end), 0),
    coalesce(sum(case when cp.status = 'parcial' then ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago) else 0 end), 0),
    coalesce(sum(case when cp.status = 'paga' then cp.valor_pago else 0 end), 0),
    coalesce(sum(case when cp.status in ('aberta','parcial') and cp.data_vencimento < current_date then ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago) else 0 end), 0)
  into v_abertas, v_parciais, v_pagas, v_vencidas
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = v_empresa
    and (p_start_date is null or cp.data_vencimento >= p_start_date)
    and (p_end_date is null or cp.data_vencimento <= p_end_date)
    and cp.status <> 'cancelada';

  return jsonb_build_object(
    'abertas', v_abertas,
    'parciais', v_parciais,
    'pagas', v_pagas,
    'vencidas', v_vencidas
  );
end;
$$;

revoke all on function public.financeiro_contas_pagar_summary(date, date) from public;
grant execute on function public.financeiro_contas_pagar_summary(date, date) to authenticated, service_role;

commit;

