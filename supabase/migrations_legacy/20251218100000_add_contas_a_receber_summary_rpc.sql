-- =============================================================================
-- RPC: get_contas_a_receber_summary()
-- Desc: Retorna um resumo dos totais para o dashboard de contas a receber.
-- =============================================================================

create or replace function public.get_contas_a_receber_summary()
returns table (
    total_pendente numeric,
    total_pago_mes numeric,
    total_vencido numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    coalesce(sum(case when status = 'pendente' then valor else 0 end), 0) as total_pendente,
    coalesce(sum(case when status = 'pago' and date_trunc('month', data_pagamento) = date_trunc('month', current_date) then valor_pago else 0 end), 0) as total_pago_mes,
    coalesce(sum(case when status = 'vencido' then valor else 0 end), 0) as total_vencido
  from public.contas_a_receber
  where empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.get_contas_a_receber_summary() from public;
grant execute on function public.get_contas_a_receber_summary() to authenticated;
