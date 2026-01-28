-- Fix (Estado da Arte): hardening RPC financeiro_saldo_atual_total
-- Motivo: release gate "RPC-first (financeiro) hardening" exige permission guard em funções SECURITY DEFINER expostas.

begin;

create or replace function public.financeiro_saldo_atual_total()
returns numeric
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric;
begin
  if v_empresa is null then
    raise exception 'Empresa não identificada';
  end if;

  -- Hardening: exige permissão do domínio Financeiro (dashboard/fluxo de caixa)
  perform public.require_permission_for_current_user('financeiro', 'view');

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

commit;

