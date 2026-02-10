-- Financeiro: Totalizador server-side para selecao (result set)
-- Objetivo:
-- - Permitir selecao por checkbox (pagina) + "selecionar todos do filtro"
-- - Totalizacao performatica e segura (RPC-first, tenant-safe, sem overfetch)

begin;

-- -----------------------------------------------------------------------------
-- Contas a Pagar: totals
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_contas_pagar_selection_totals(
  p_mode text,
  p_ids uuid[] default null,
  p_excluded_ids uuid[] default null,
  p_q text default null,
  p_status text default null,
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
  v_selected_count bigint := 0;
  v_total_bruto numeric := 0;
  v_total_pago numeric := 0;
  v_total_saldo numeric := 0;
  v_total_vencido numeric := 0;
  v_total_a_vencer numeric := 0;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','view');

  if p_mode not in ('explicit', 'all_matching') then
    raise exception 'p_mode inválido. Use explicit|all_matching.' using errcode = 'P0001';
  end if;

  with base as (
    select
      cp.id,
      cp.data_vencimento,
      cp.status,
      (cp.valor_total + cp.multa + cp.juros - cp.desconto) as bruto,
      coalesce(cp.valor_pago, 0) as pago
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
        or btrim(p_q) = ''
        or cp.descricao ilike '%'||p_q||'%'
        or coalesce(cp.documento_ref,'') ilike '%'||p_q||'%'
        or coalesce(f.nome,'') ilike '%'||p_q||'%'
      )
  ),
  selected as (
    select *
    from base b
    where
      (
        p_mode = 'explicit'
        and b.id = any(coalesce(p_ids, '{}'::uuid[]))
      )
      or
      (
        p_mode = 'all_matching'
        and not (b.id = any(coalesce(p_excluded_ids, '{}'::uuid[])))
      )
  )
  select
    count(*)::bigint,
    coalesce(sum(bruto), 0),
    coalesce(sum(pago), 0),
    coalesce(sum(bruto - pago), 0),
    coalesce(sum(
      case
        when status in ('aberta','parcial') and data_vencimento < current_date then (bruto - pago)
        else 0
      end
    ), 0),
    coalesce(sum(
      case
        when status in ('aberta','parcial') and data_vencimento >= current_date then (bruto - pago)
        else 0
      end
    ), 0)
  into
    v_selected_count,
    v_total_bruto,
    v_total_pago,
    v_total_saldo,
    v_total_vencido,
    v_total_a_vencer
  from selected;

  return jsonb_build_object(
    'selected_count', v_selected_count,
    'total_bruto', v_total_bruto,
    'total_pago', v_total_pago,
    'total_saldo', v_total_saldo,
    'total_vencido', v_total_vencido,
    'total_a_vencer', v_total_a_vencer
  );
end;
$$;

revoke all on function public.financeiro_contas_pagar_selection_totals(text, uuid[], uuid[], text, text, date, date) from public, anon;
grant execute on function public.financeiro_contas_pagar_selection_totals(text, uuid[], uuid[], text, text, date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Contas a Receber: totals
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_contas_a_receber_selection_totals(
  p_mode text,
  p_ids uuid[] default null,
  p_excluded_ids uuid[] default null,
  p_q text default null,
  p_status public.status_conta_receber default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_selected_count bigint := 0;
  v_total_valor numeric := 0;
  v_total_recebido numeric := 0;
  v_total_saldo numeric := 0;
  v_total_vencido numeric := 0;
  v_total_a_vencer numeric := 0;
begin
  perform public.require_permission_for_current_user('contas_a_receber','view');

  if p_mode not in ('explicit', 'all_matching') then
    raise exception 'p_mode inválido. Use explicit|all_matching.' using errcode = 'P0001';
  end if;

  with base as (
    select
      c.id,
      c.status,
      c.data_vencimento,
      c.valor,
      coalesce(c.valor_pago, 0) as valor_pago
    from public.contas_a_receber c
    left join public.pessoas p on p.id = c.cliente_id
    where c.empresa_id = public.current_empresa_id()
      and (
        p_status is null
        or (
          p_status = 'vencido'::public.status_conta_receber
          and (
            c.status = 'vencido'::public.status_conta_receber
            or (
              c.status = 'pendente'::public.status_conta_receber
              and c.data_vencimento < current_date
            )
          )
        )
        or (
          p_status = 'pendente'::public.status_conta_receber
          and c.status = 'pendente'::public.status_conta_receber
          and c.data_vencimento >= current_date
        )
        or (
          p_status not in ('vencido'::public.status_conta_receber, 'pendente'::public.status_conta_receber)
          and c.status = p_status
        )
      )
      and (p_start_date is null or c.data_vencimento >= p_start_date)
      and (p_end_date is null or c.data_vencimento <= p_end_date)
      and (
        p_q is null
        or btrim(p_q) = ''
        or (c.descricao ilike '%'||p_q||'%' or p.nome ilike '%'||p_q||'%')
      )
  ),
  selected as (
    select *
    from base b
    where
      (
        p_mode = 'explicit'
        and b.id = any(coalesce(p_ids, '{}'::uuid[]))
      )
      or
      (
        p_mode = 'all_matching'
        and not (b.id = any(coalesce(p_excluded_ids, '{}'::uuid[])))
      )
  ),
  calc as (
    select
      *,
      case
        when status in ('pago'::public.status_conta_receber, 'cancelado'::public.status_conta_receber) then 0
        else greatest(valor - valor_pago, 0)
      end as saldo
    from selected
  )
  select
    count(*)::bigint,
    coalesce(sum(valor), 0),
    coalesce(sum(valor_pago), 0),
    coalesce(sum(saldo), 0),
    coalesce(sum(
      case
        when status = 'vencido'::public.status_conta_receber then saldo
        when status in ('pendente'::public.status_conta_receber, 'parcial'::public.status_conta_receber) and data_vencimento < current_date then saldo
        else 0
      end
    ), 0),
    coalesce(sum(
      case
        when status in ('pendente'::public.status_conta_receber, 'parcial'::public.status_conta_receber) and data_vencimento >= current_date then saldo
        else 0
      end
    ), 0)
  into
    v_selected_count,
    v_total_valor,
    v_total_recebido,
    v_total_saldo,
    v_total_vencido,
    v_total_a_vencer
  from calc;

  return jsonb_build_object(
    'selected_count', v_selected_count,
    'total_valor', v_total_valor,
    'total_recebido', v_total_recebido,
    'total_saldo', v_total_saldo,
    'total_vencido', v_total_vencido,
    'total_a_vencer', v_total_a_vencer
  );
end;
$$;

revoke all on function public.financeiro_contas_a_receber_selection_totals(text, uuid[], uuid[], text, public.status_conta_receber, date, date) from public, anon;
grant execute on function public.financeiro_contas_a_receber_selection_totals(text, uuid[], uuid[], text, public.status_conta_receber, date, date) to authenticated, service_role;

commit;

