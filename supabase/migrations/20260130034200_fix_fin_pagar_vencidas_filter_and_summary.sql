-- Financeiro: Contas a Pagar — "vencidas" derivado por data_vencimento + status aberta/parcial
-- Objetivo:
-- - Card "Em aberto" não deve incluir vencidas
-- - Filtro de status deve permitir "vencidas" (derivado) sem depender de status no banco

begin;

create or replace function public.financeiro_contas_pagar_list(
  p_limit       int  default 50,
  p_offset      int  default 0,
  p_q           text default null,
  p_status      text default null,
  p_start_date  date default null,
  p_end_date    date default null
)
returns table (
  id               uuid,
  fornecedor_id    uuid,
  fornecedor_nome  text,
  documento_ref    text,
  descricao        text,
  data_emissao     date,
  data_vencimento  date,
  data_pagamento   date,
  valor_total      numeric,
  valor_pago       numeric,
  saldo            numeric,
  status           text,
  forma_pagamento  text,
  total_count      bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  return query
  select
    cp.id,
    cp.fornecedor_id,
    f.nome as fornecedor_nome,
    cp.documento_ref,
    cp.descricao,
    cp.data_emissao,
    cp.data_vencimento,
    cp.data_pagamento,
    cp.valor_total,
    cp.valor_pago,
    (cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago as saldo,
    cp.status,
    cp.forma_pagamento,
    count(*) over() as total_count
  from public.financeiro_contas_pagar cp
  left join public.pessoas f on f.id = cp.fornecedor_id
  where cp.empresa_id = v_empresa
    and (
      p_status is null
      or (
        p_status = 'vencidas'
        and cp.status in ('aberta','parcial')
        and cp.data_vencimento < current_date
      )
      or (
        p_status = 'aberta'
        and cp.status = 'aberta'
        and cp.data_vencimento >= current_date
      )
      or (
        p_status = 'parcial'
        and cp.status = 'parcial'
        and cp.data_vencimento >= current_date
      )
      or (
        p_status not in ('vencidas','aberta','parcial')
        and cp.status = p_status
      )
    )
    and (p_start_date is null or cp.data_vencimento >= p_start_date)
    and (p_end_date is null or cp.data_vencimento <= p_end_date)
    and (
      p_q is null
      or cp.descricao ilike '%'||p_q||'%'
      or coalesce(cp.documento_ref,'') ilike '%'||p_q||'%'
      or coalesce(f.nome,'') ilike '%'||p_q||'%'
    )
  order by
    (cp.status in ('aberta','parcial')) desc,
    cp.data_vencimento asc nulls last,
    cp.created_at asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_contas_pagar_list(int, int, text, text, date, date) from public;
grant execute on function public.financeiro_contas_pagar_list(int, int, text, text, date, date) to authenticated, service_role;

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
    coalesce(sum(case when cp.status = 'aberta' and cp.data_vencimento >= current_date then ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago) else 0 end), 0),
    coalesce(sum(case when cp.status = 'parcial' and cp.data_vencimento >= current_date then ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago) else 0 end), 0),
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

