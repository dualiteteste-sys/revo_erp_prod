-- Financeiro: ajustes de filtro (em aberto/pendente) + totals por seleção
-- - "Em aberto"/"Pendente" devem considerar todos os itens do status (inclusive vencidos)
-- - Totais por seleção explícita não devem depender de filtros ativos

begin;

-- -----------------------------------------------------------------------------
-- Contas a Pagar: list (status "aberta/parcial" sem corte por vencimento)
-- -----------------------------------------------------------------------------

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
  perform public.require_permission_for_current_user('contas_a_pagar','view');

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
      )
      or (
        p_status = 'parcial'
        and cp.status = 'parcial'
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
        (p_mode = 'explicit' and cp.id = any(coalesce(p_ids, '{}'::uuid[])))
        or (
          p_mode = 'all_matching'
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
            )
            or (
              p_status = 'parcial'
              and cp.status = 'parcial'
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
          and not (cp.id = any(coalesce(p_excluded_ids, '{}'::uuid[])))
        )
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
  from base;

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
-- Contas a Receber: count/list (status "pendente" sem corte por vencimento)
-- -----------------------------------------------------------------------------

create or replace function public.count_contas_a_receber_v2(
  p_q text default null,
  p_status public.status_conta_receber default null,
  p_start_date date default null,
  p_end_date date default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return (
    select count(*)
    from public.contas_a_receber c
    left join public.pessoas p on p.id = c.cliente_id
    where c.empresa_id = public.current_empresa_id()
      and (
        p_status is null
        or (
          p_status = 'vencido'::public.status_conta_receber
          and (c.status = 'vencido'::public.status_conta_receber or (c.status = 'pendente'::public.status_conta_receber and c.data_vencimento < current_date))
        )
        or (
          p_status = 'pendente'::public.status_conta_receber
          and c.status = 'pendente'::public.status_conta_receber
        )
        or (
          p_status not in ('vencido'::public.status_conta_receber, 'pendente'::public.status_conta_receber)
          and c.status = p_status
        )
      )
      and (p_start_date is null or c.data_vencimento >= p_start_date)
      and (p_end_date is null or c.data_vencimento <= p_end_date)
      and (p_q is null or (
        c.descricao ilike '%'||p_q||'%' or
        p.nome ilike '%'||p_q||'%'
      ))
  );
end;
$$;

revoke all on function public.count_contas_a_receber_v2(text, public.status_conta_receber, date, date) from public;
grant execute on function public.count_contas_a_receber_v2(text, public.status_conta_receber, date, date) to authenticated, service_role;

create or replace function public.list_contas_a_receber_v2(
  p_limit int default 20,
  p_offset int default 0,
  p_q text default null,
  p_status public.status_conta_receber default null,
  p_start_date date default null,
  p_end_date date default null,
  p_order_by text default 'data_vencimento',
  p_order_dir text default 'asc'
)
returns table (
  id uuid,
  descricao text,
  cliente_nome text,
  data_vencimento date,
  valor numeric,
  status public.status_conta_receber
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_by text := lower(coalesce(p_order_by,'data_vencimento'));
  v_order_dir text := case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end;
  v_sql text;
  v_status_sql text := '';
  v_start_sql text := '';
  v_end_sql text := '';
  v_q_sql text := '';
begin
  v_order_by := case
    when v_order_by in ('data_vencimento','descricao','valor','status','cliente_nome') then v_order_by
    else 'data_vencimento'
  end;

  if p_status is not null then
    if p_status = 'vencido'::public.status_conta_receber then
      v_status_sql := ' and (c.status = ''vencido''::public.status_conta_receber or (c.status = ''pendente''::public.status_conta_receber and c.data_vencimento < current_date))';
    elsif p_status = 'pendente'::public.status_conta_receber then
      v_status_sql := ' and (c.status = ''pendente''::public.status_conta_receber)';
    else
      v_status_sql := format(' and c.status = %L::public.status_conta_receber', p_status::text);
    end if;
  end if;

  if p_start_date is not null then
    v_start_sql := format(' and c.data_vencimento >= %L::date', p_start_date::text);
  end if;
  if p_end_date is not null then
    v_end_sql := format(' and c.data_vencimento <= %L::date', p_end_date::text);
  end if;
  if p_q is not null and btrim(p_q) <> '' then
    v_q_sql := format(
      ' and (c.descricao ilike %L or p.nome ilike %L)',
      '%'||p_q||'%',
      '%'||p_q||'%'
    );
  end if;

  v_sql := format($fmt$
    select
      c.id,
      c.descricao,
      p.nome as cliente_nome,
      c.data_vencimento,
      c.valor,
      c.status
    from public.contas_a_receber c
    left join public.pessoas p on p.id = c.cliente_id
    where c.empresa_id = public.current_empresa_id()
      %1$s
    order by %2$s %3$s
    limit %4$s offset %5$s
  $fmt$,
    (v_status_sql || v_start_sql || v_end_sql || v_q_sql),
    case
      when v_order_by = 'cliente_nome' then 'p.nome'
      else 'c.' || v_order_by
    end,
    v_order_dir,
    p_limit,
    p_offset
  );

  return query execute v_sql;
end;
$$;

revoke all on function public.list_contas_a_receber_v2(int, int, text, public.status_conta_receber, date, date, text, text) from public;
grant execute on function public.list_contas_a_receber_v2(int, int, text, public.status_conta_receber, date, date, text, text) to authenticated, service_role;

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
        (p_mode = 'explicit' and c.id = any(coalesce(p_ids, '{}'::uuid[])))
        or (
          p_mode = 'all_matching'
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
          and not (c.id = any(coalesce(p_excluded_ids, '{}'::uuid[])))
        )
      )
  ),
  calc as (
    select
      *,
      case
        when status in ('pago'::public.status_conta_receber, 'cancelado'::public.status_conta_receber) then 0
        else greatest(valor - valor_pago, 0)
      end as saldo
    from base
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
