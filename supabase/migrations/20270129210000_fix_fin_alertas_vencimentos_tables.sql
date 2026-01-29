-- Fix: dashboard financeiro_alertas_vencimentos
-- Motivo: ambiente prod não possui a tabela legacy public.financeiro_titulos.
-- Solução: calcular alertas usando as tabelas atuais:
-- - public.contas_a_receber (receber)
-- - public.financeiro_contas_pagar (pagar)

begin;

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

  -- Receber: pendentes/vencidos (status derivado por data) com saldo > 0
  select
    count(*),
    coalesce(sum(greatest(coalesce(c.valor, 0) - coalesce(c.valor_pago, 0), 0)), 0)
  into v_atrasado_receber_qtd, v_atrasado_receber_valor
  from public.contas_a_receber c
  where c.empresa_id = v_empresa
    and c.status <> 'cancelado'::public.status_conta_receber
    and c.status <> 'pago'::public.status_conta_receber
    and c.data_vencimento < current_date;

  select
    count(*),
    coalesce(sum(greatest(coalesce(c.valor, 0) - coalesce(c.valor_pago, 0), 0)), 0)
  into v_hoje_receber_qtd, v_hoje_receber_valor
  from public.contas_a_receber c
  where c.empresa_id = v_empresa
    and c.status <> 'cancelado'::public.status_conta_receber
    and c.status <> 'pago'::public.status_conta_receber
    and c.data_vencimento = current_date;

  -- Pagar: aberta/parcial com saldo > 0
  select
    count(*),
    coalesce(
      sum(
        greatest(
          (coalesce(cp.valor_total, 0) + coalesce(cp.multa, 0) + coalesce(cp.juros, 0) - coalesce(cp.desconto, 0))
          - coalesce(cp.valor_pago, 0),
          0
        )
      ),
      0
    )
  into v_atrasado_pagar_qtd, v_atrasado_pagar_valor
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = v_empresa
    and cp.status in ('aberta', 'parcial')
    and cp.data_vencimento < current_date;

  select
    count(*),
    coalesce(
      sum(
        greatest(
          (coalesce(cp.valor_total, 0) + coalesce(cp.multa, 0) + coalesce(cp.juros, 0) - coalesce(cp.desconto, 0))
          - coalesce(cp.valor_pago, 0),
          0
        )
      ),
      0
    )
  into v_hoje_pagar_qtd, v_hoje_pagar_valor
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = v_empresa
    and cp.status in ('aberta', 'parcial')
    and cp.data_vencimento = current_date;

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

revoke all on function public.financeiro_alertas_vencimentos() from public;
grant execute on function public.financeiro_alertas_vencimentos() to authenticated, service_role;

commit;

