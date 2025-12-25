/*
  Financeiro: atalho seguro para registrar pagamento (Contas a Pagar)

  Motivo:
  - UX: permitir baixa rápida (1 clique) sem reenviar payload completo.
  - Regras: não pagar título cancelado; preencher data/valor padrão.
*/

begin;

create or replace function public.financeiro_conta_pagar_pagar(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_total numeric;
begin
  select *
    into rec
  from public.financeiro_contas_pagar
  where id = p_id
    and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][pagar] Conta a pagar não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'cancelada' then
    raise exception '[FINANCEIRO][pagar] Não é possível pagar uma conta cancelada.' using errcode = 'P0001';
  end if;

  v_total := (rec.valor_total + rec.multa + rec.juros - rec.desconto);

  update public.financeiro_contas_pagar
  set
    status = 'paga',
    data_pagamento = v_data,
    valor_pago = coalesce(p_valor_pago, v_total)
  where id = rec.id
    and empresa_id = v_empresa
  returning * into rec;

  perform pg_notify('app_log', '[RPC] financeiro_conta_pagar_pagar ' || p_id);

  return to_jsonb(rec)
    || jsonb_build_object('saldo', (rec.valor_total + rec.multa + rec.juros - rec.desconto) - rec.valor_pago);
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagar(uuid, date, numeric) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagar(uuid, date, numeric) to authenticated, service_role;

commit;

