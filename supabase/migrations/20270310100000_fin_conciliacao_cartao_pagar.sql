-- Migration: RPC de conciliação de cartão para contas a pagar
-- Cria financeiro_contas_pagar_conciliacao_list — espelhando a RPC de receber
-- (financeiro_contas_a_receber_conciliacao_list) mas para contas a pagar.

begin;

create or replace function public.financeiro_contas_pagar_conciliacao_list(
  p_forma_pagamento text default 'Cartão de crédito',
  p_status text default 'pendentes',
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
  v_result jsonb;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','read');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;

  with contas as (
    select
      cp.id,
      cp.descricao,
      p.nome as fornecedor_nome,
      cp.documento_ref,
      cp.data_vencimento,
      cp.valor_total as valor,
      cp.valor_pago,
      cp.status,
      cp.forma_pagamento,
      cp.origem_tipo,
      cp.origem_id,
      cp.data_pagamento,
      -- saldo pendente
      (cp.valor_total - cp.valor_pago) as saldo
    from public.financeiro_contas_pagar cp
    left join public.pessoas p on p.id = cp.fornecedor_id
    where cp.empresa_id = v_empresa
      and cp.forma_pagamento = p_forma_pagamento
      and (
        case p_status
          when 'pendentes' then
            cp.status in ('aberta','parcial')
          when 'pago' then
            cp.status = 'paga'
          when 'todos' then
            cp.status <> 'cancelada'
          else
            cp.status in ('aberta','parcial')
        end
      )
      and (p_start_date is null or cp.data_vencimento >= p_start_date)
      and (p_end_date is null or cp.data_vencimento <= p_end_date)
    order by cp.data_vencimento asc, cp.descricao asc
  ),
  grouped as (
    select
      c.data_vencimento,
      count(*) as total_titulos,
      sum(c.valor) as total_valor,
      sum(coalesce(c.valor_pago, 0)) as total_pago,
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'descricao', c.descricao,
          'fornecedor_nome', c.fornecedor_nome,
          'documento_ref', c.documento_ref,
          'data_vencimento', c.data_vencimento,
          'valor', c.valor,
          'valor_pago', c.valor_pago,
          'saldo', c.saldo,
          'status', c.status,
          'forma_pagamento', c.forma_pagamento,
          'origem_tipo', c.origem_tipo,
          'data_pagamento', c.data_pagamento
        ) order by c.descricao
      ) as titulos
    from contas c
    group by c.data_vencimento
    order by c.data_vencimento asc
  ),
  summary as (
    select
      coalesce(sum(case when c.status in ('aberta','parcial') and c.data_vencimento >= current_date then c.saldo else 0 end), 0) as total_a_pagar,
      coalesce(sum(case when c.status in ('aberta','parcial') and c.data_vencimento < current_date then c.saldo else 0 end), 0) as total_vencido,
      coalesce(sum(case when c.status = 'paga' then coalesce(c.valor_pago, c.valor) else 0 end), 0) as total_pago
    from contas c
  )
  select jsonb_build_object(
    'summary', (select row_to_json(s)::jsonb from summary s),
    'groups', coalesce((select jsonb_agg(row_to_json(g)::jsonb) from grouped g), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.financeiro_contas_pagar_conciliacao_list(text,text,date,date) from public;
grant execute on function public.financeiro_contas_pagar_conciliacao_list(text,text,date,date) to authenticated, service_role;

commit;
