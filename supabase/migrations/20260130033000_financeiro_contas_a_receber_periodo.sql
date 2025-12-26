/*
  Financeiro: Contas a Receber - filtros por período (MVP)

  Adiciona:
  - p_start_date / p_end_date (data_vencimento) em count/list
  - p_start_date / p_end_date em summary (para manter UI consistente quando filtra)

  Compatibilidade:
  - Mantém as assinaturas antigas via wrappers.
*/

begin;

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
      and (p_status is null or c.status = p_status)
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
grant execute on function public.count_contas_a_receber_v2(text, public.status_conta_receber, date, date) to authenticated;

create or replace function public.count_contas_a_receber(
  p_q text default null,
  p_status public.status_conta_receber default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.count_contas_a_receber_v2(p_q, p_status, null, null);
end;
$$;

revoke all on function public.count_contas_a_receber(text, public.status_conta_receber) from public;
grant execute on function public.count_contas_a_receber(text, public.status_conta_receber) to authenticated;

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
    v_status_sql := format(' and c.status = %L::public.status_conta_receber', p_status::text);
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
grant execute on function public.list_contas_a_receber_v2(int, int, text, public.status_conta_receber, date, date, text, text) to authenticated;

create or replace function public.list_contas_a_receber(
  p_limit int default 20,
  p_offset int default 0,
  p_q text default null,
  p_status public.status_conta_receber default null,
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
begin
  return query
  select *
  from public.list_contas_a_receber_v2(p_limit, p_offset, p_q, p_status, null, null, p_order_by, p_order_dir);
end;
$$;

revoke all on function public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) from public;
grant execute on function public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) to authenticated;

create or replace function public.get_contas_a_receber_summary_v2(
  p_start_date date default null,
  p_end_date date default null
)
returns table(total_pendente numeric, total_pago_mes numeric, total_vencido numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    coalesce(sum(case when status = 'pendente' then valor else 0 end), 0) as total_pendente,
    coalesce(sum(
      case
        when status <> 'pago' then 0
        when (p_start_date is not null or p_end_date is not null)
          and (p_start_date is null or data_pagamento >= p_start_date)
          and (p_end_date is null or data_pagamento <= p_end_date)
          then coalesce(valor_pago, 0)
        when (p_start_date is null and p_end_date is null)
          and date_trunc('month', data_pagamento) = date_trunc('month', current_date)
          then coalesce(valor_pago, 0)
        else 0
      end
    ), 0) as total_pago_mes,
    coalesce(sum(case when status = 'vencido' then valor else 0 end), 0) as total_vencido
  from public.contas_a_receber
  where empresa_id = public.current_empresa_id()
    and (p_start_date is null or data_vencimento >= p_start_date)
    and (p_end_date is null or data_vencimento <= p_end_date);
end;
$$;

revoke all on function public.get_contas_a_receber_summary_v2(date, date) from public;
grant execute on function public.get_contas_a_receber_summary_v2(date, date) to authenticated;

create or replace function public.get_contas_a_receber_summary()
returns table(total_pendente numeric, total_pago_mes numeric, total_vencido numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query select * from public.get_contas_a_receber_summary_v2(null, null);
end;
$$;

revoke all on function public.get_contas_a_receber_summary() from public;
grant execute on function public.get_contas_a_receber_summary() to authenticated;

commit;
