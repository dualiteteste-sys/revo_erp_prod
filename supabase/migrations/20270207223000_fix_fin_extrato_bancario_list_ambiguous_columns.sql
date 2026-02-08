-- Fix: evita ambiguidade entre variáveis implícitas de RETURNS TABLE
-- e colunas homônimas na RPC de extrato bancário.

create or replace function public.financeiro_extrato_bancario_list(
  p_conta_corrente_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_tipo_lancamento text default null,
  p_conciliado boolean default null,
  p_q text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  conta_corrente_id uuid,
  conta_nome text,
  data_lancamento date,
  descricao text,
  documento_ref text,
  tipo_lancamento text,
  valor numeric,
  saldo_apos_lancamento numeric,
  conciliado boolean,
  movimentacao_id uuid,
  movimentacao_data date,
  movimentacao_tipo text,
  movimentacao_descricao text,
  movimentacao_valor numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permission_for_current_user('tesouraria','view');

  if p_tipo_lancamento is not null and p_tipo_lancamento not in ('credito','debito') then
    raise exception 'p_tipo_lancamento inválido. Use credito, debito ou null.';
  end if;

  return query
  with filtered as (
    select
      e.id,
      e.conta_corrente_id,
      cc.nome as conta_nome,
      e.data_lancamento,
      e.descricao,
      e.documento_ref,
      e.tipo_lancamento,
      e.valor,
      e.saldo_apos_lancamento,
      e.conciliado,
      e.movimentacao_id,
      m.data_movimento as movimentacao_data,
      m.tipo_mov as movimentacao_tipo,
      m.descricao as movimentacao_descricao,
      m.valor as movimentacao_valor,
      e.sequencia_importacao,
      (case when e.tipo_lancamento = 'credito' then e.valor else -e.valor end) as delta
    from public.financeiro_extratos_bancarios e
    join public.financeiro_contas_correntes cc
      on cc.id = e.conta_corrente_id
     and cc.empresa_id = v_empresa
    left join public.financeiro_movimentacoes m
      on m.id = e.movimentacao_id
     and m.empresa_id = v_empresa
    where e.empresa_id = v_empresa
      and (p_conta_corrente_id is null or e.conta_corrente_id = p_conta_corrente_id)
      and (p_start_date is null or e.data_lancamento >= p_start_date)
      and (p_end_date is null or e.data_lancamento <= p_end_date)
      and (p_conciliado is null or e.conciliado = p_conciliado)
      and (p_tipo_lancamento is null or e.tipo_lancamento = p_tipo_lancamento)
      and (
        p_q is null
        or e.descricao ilike '%' || p_q || '%'
        or coalesce(e.documento_ref, '') ilike '%' || p_q || '%'
        or coalesce(e.identificador_banco, '') ilike '%' || p_q || '%'
      )
  ),
  min_date as (
    select
      f.conta_corrente_id,
      min(f.data_lancamento) as min_data
    from filtered f
    group by f.conta_corrente_id
  ),
  base as (
    select
      md.conta_corrente_id,
      md.min_data,
      coalesce(
        (
          select eprev.saldo_apos_lancamento
          from public.financeiro_extratos_bancarios eprev
          where eprev.empresa_id = v_empresa
            and eprev.conta_corrente_id = md.conta_corrente_id
            and eprev.saldo_apos_lancamento is not null
            and eprev.data_lancamento < md.min_data
          order by eprev.data_lancamento desc, eprev.sequencia_importacao desc, eprev.id desc
          limit 1
        ),
        (
          select
            case
              when cc.data_saldo_inicial is null or cc.data_saldo_inicial <= md.min_data then cc.saldo_inicial
              else null
            end
          from public.financeiro_contas_correntes cc
          where cc.empresa_id = v_empresa
            and cc.id = md.conta_corrente_id
        )
      ) as base_balance
    from min_date md
  ),
  grp as (
    select
      f.*,
      count(*) over() as total_count,
      sum(case when f.saldo_apos_lancamento is not null then 1 else 0 end)
        over (partition by f.conta_corrente_id order by f.data_lancamento, f.sequencia_importacao, f.id) as grp,
      sum(f.delta) over (partition by f.conta_corrente_id order by f.data_lancamento, f.sequencia_importacao, f.id) as cum_delta_total
    from filtered f
  ),
  ordered as (
    select
      g.*,
      sum(g.delta) over (partition by g.conta_corrente_id, g.grp order by g.data_lancamento, g.sequencia_importacao, g.id) as cum_delta_grp,
      first_value(g.delta) over (partition by g.conta_corrente_id, g.grp order by g.data_lancamento, g.sequencia_importacao, g.id) as anchor_delta,
      first_value(g.saldo_apos_lancamento) over (partition by g.conta_corrente_id, g.grp order by g.data_lancamento, g.sequencia_importacao, g.id) as anchor_balance
    from grp g
  )
  select
    o.id,
    o.conta_corrente_id,
    o.conta_nome,
    o.data_lancamento,
    o.descricao,
    o.documento_ref,
    o.tipo_lancamento,
    o.valor,
    coalesce(
      o.saldo_apos_lancamento,
      case
        when o.grp = 0 then (b.base_balance + o.cum_delta_total)
        else (o.anchor_balance + (o.cum_delta_grp - o.anchor_delta))
      end
    ) as saldo_apos_lancamento,
    o.conciliado,
    o.movimentacao_id,
    o.movimentacao_data,
    o.movimentacao_tipo,
    o.movimentacao_descricao,
    o.movimentacao_valor,
    o.total_count
  from ordered o
  left join base b
    on b.conta_corrente_id = o.conta_corrente_id
  order by o.data_lancamento asc, o.sequencia_importacao asc, o.id asc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer) from public, anon;
grant execute on function public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer) to authenticated, service_role;
