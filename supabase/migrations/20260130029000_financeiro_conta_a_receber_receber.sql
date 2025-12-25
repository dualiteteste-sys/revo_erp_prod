/*
  Financeiro: atalho seguro para registrar recebimento

  Motivo:
  - Evitar que a UI precise enviar payload completo (create_update_conta_a_receber)
  - Garantir regras: não receber título cancelado; preencher data/valor padrão
*/

begin;

create or replace function public.financeiro_conta_a_receber_receber(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rec public.contas_a_receber;
  v_data date := coalesce(p_data_pagamento, current_date);
begin
  select *
    into rec
  from public.contas_a_receber
  where id = p_id
    and empresa_id = public.current_empresa_id();

  if rec.id is null then
    raise exception '[FINANCEIRO][receber] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'cancelado' then
    raise exception '[FINANCEIRO][receber] Não é possível receber uma conta cancelada.' using errcode = 'P0001';
  end if;

  update public.contas_a_receber
  set
    status = 'pago',
    data_pagamento = v_data,
    valor_pago = coalesce(p_valor_pago, rec.valor)
  where id = rec.id
    and empresa_id = public.current_empresa_id()
  returning * into rec;

  perform pg_notify('app_log', '[RPC] financeiro_conta_a_receber_receber ' || p_id);
  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_receber(uuid, date, numeric) from public, anon;
grant execute on function public.financeiro_conta_a_receber_receber(uuid, date, numeric) to authenticated, service_role;

commit;

