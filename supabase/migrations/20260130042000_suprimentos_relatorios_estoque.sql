/*
  Suprimentos: Relatórios (Valorização/ABC + Baixo estoque)

  Frontend já chama:
    - suprimentos_relatorio_valorizacao(p_search)
    - suprimentos_relatorio_baixo_estoque(p_search)

  Objetivo:
    - Garantir que esses RPCs existam em DB limpo (CI/verify).
    - Ser resiliente a drift de schema (ex.: estoque_minimo vs estoque_min).
*/

begin;

create schema if not exists public;

-- -----------------------------------------------------------------------------
-- Helpers (resolve nomes de colunas com drift)
-- -----------------------------------------------------------------------------
create or replace function public.__col_exists(p_table regclass, p_col text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = p_table
      and a.attname = p_col
      and a.attnum > 0
      and not a.attisdropped
  );
$$;

revoke all on function public.__col_exists(regclass, text) from public, anon;
grant execute on function public.__col_exists(regclass, text) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: Valorização de estoque (curva ABC)
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_relatorio_valorizacao(text);
create or replace function public.suprimentos_relatorio_valorizacao(
  p_search text default null
)
returns table (
  produto_id uuid,
  nome text,
  sku text,
  unidade text,
  saldo numeric,
  custo_medio numeric,
  valor_total numeric,
  percentual numeric,
  acumulado numeric,
  classe text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_min_col text;
  v_max_col text;
  v_ctrl_col text;
  v_ativo_col text;
  v_status_col text;
  v_saldo_expr text;
  v_custo_expr text;
  v_sql text;
begin
  if to_regclass('public.produtos') is null then
    return;
  end if;

  v_ctrl_col := case
    when public.__col_exists('public.produtos'::regclass, 'controlar_estoque') then 'controlar_estoque'
    when public.__col_exists('public.produtos'::regclass, 'controla_estoque') then 'controla_estoque'
    else null
  end;

  v_ativo_col := case
    when public.__col_exists('public.produtos'::regclass, 'ativo') then 'ativo'
    else null
  end;

  v_status_col := case
    when public.__col_exists('public.produtos'::regclass, 'status') then 'status'
    else null
  end;

  v_saldo_expr := case
    when to_regclass('public.estoque_saldos') is not null then 'coalesce(es.saldo, 0)'
    when public.__col_exists('public.produtos'::regclass, 'estoque_atual') then 'coalesce(p.estoque_atual, 0)'
    else '0'
  end;

  v_custo_expr := case
    when to_regclass('public.estoque_saldos') is not null then 'coalesce(es.custo_medio, 0)'
    when public.__col_exists('public.produtos'::regclass, 'preco_custo') then 'coalesce(p.preco_custo, 0)'
    else '0'
  end;

  v_sql := format($fmt$
    with base as (
      select
        p.id as produto_id,
        p.nome,
        p.sku,
        coalesce(p.unidade, 'un') as unidade,
        %1$s::numeric as saldo,
        %2$s::numeric as custo_medio
      from public.produtos p
      %3$s
      where p.empresa_id = $1
        %4$s
        %5$s
        %6$s
        and (
          $2 is null
          or btrim($2) = ''
          or lower(p.nome) like '%%'||lower($2)||'%%'
          or lower(coalesce(p.sku,'')) like '%%'||lower($2)||'%%'
          or lower(coalesce(p.codigo,'')) like '%%'||lower($2)||'%%'
        )
    ),
    calc as (
      select
        *,
        (saldo * custo_medio) as valor_total
      from base
      where saldo > 0
    ),
    tot as (
      select coalesce(sum(valor_total),0) as total
      from calc
    ),
    ranked as (
      select
        c.*,
        case when t.total > 0 then (c.valor_total / t.total) * 100 else 0 end as percentual,
        case when t.total > 0 then (sum(c.valor_total) over (order by c.valor_total desc, c.nome asc) / t.total) * 100 else 0 end as acumulado
      from calc c
      cross join tot t
    )
    select
      produto_id,
      nome,
      sku,
      unidade,
      saldo,
      custo_medio,
      valor_total,
      percentual,
      acumulado,
      case
        when acumulado <= 80 then 'A'
        when acumulado <= 95 then 'B'
        else 'C'
      end as classe
    from ranked
    order by valor_total desc, nome asc
  $fmt$,
    v_saldo_expr,
    v_custo_expr,
    case
      when to_regclass('public.estoque_saldos') is not null then 'left join public.estoque_saldos es on es.empresa_id = $1 and es.produto_id = p.id'
      else ''
    end,
    case
      when v_ctrl_col is not null then format('and coalesce(p.%I, true) = true', v_ctrl_col)
      else ''
    end,
    case
      when v_ativo_col is not null then format('and coalesce(p.%I, true) = true', v_ativo_col)
      else ''
    end,
    case
      when v_status_col is not null then format('and coalesce(p.%I::text, ''ativo'') not in (''inativo'',''cancelado'')', v_status_col)
      else ''
    end
  );

  return query execute v_sql using v_emp, p_search;
end;
$$;

revoke all on function public.suprimentos_relatorio_valorizacao(text) from public, anon;
grant execute on function public.suprimentos_relatorio_valorizacao(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: Baixo estoque / sugestão de compra
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_relatorio_baixo_estoque(text);
create or replace function public.suprimentos_relatorio_baixo_estoque(
  p_search text default null
)
returns table (
  produto_id uuid,
  nome text,
  sku text,
  unidade text,
  saldo numeric,
  estoque_min numeric,
  estoque_max numeric,
  sugestao_compra numeric,
  fornecedor_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_min_col text;
  v_max_col text;
  v_ctrl_col text;
  v_ativo_col text;
  v_status_col text;
  v_saldo_expr text;
  v_min_expr text;
  v_max_expr text;
  v_join_params text := '';
  v_sql text;
begin
  if to_regclass('public.produtos') is null then
    return;
  end if;

  v_ctrl_col := case
    when public.__col_exists('public.produtos'::regclass, 'controlar_estoque') then 'controlar_estoque'
    when public.__col_exists('public.produtos'::regclass, 'controla_estoque') then 'controla_estoque'
    else null
  end;

  v_ativo_col := case
    when public.__col_exists('public.produtos'::regclass, 'ativo') then 'ativo'
    else null
  end;

  v_status_col := case
    when public.__col_exists('public.produtos'::regclass, 'status') then 'status'
    else null
  end;

  v_min_col := case
    when public.__col_exists('public.produtos'::regclass, 'estoque_minimo') then 'estoque_minimo'
    when public.__col_exists('public.produtos'::regclass, 'estoque_min') then 'estoque_min'
    else null
  end;

  v_max_col := case
    when public.__col_exists('public.produtos'::regclass, 'estoque_maximo') then 'estoque_maximo'
    when public.__col_exists('public.produtos'::regclass, 'estoque_max') then 'estoque_max'
    else null
  end;

  v_saldo_expr := case
    when to_regclass('public.estoque_saldos') is not null then 'coalesce(es.saldo, 0)'
    when public.__col_exists('public.produtos'::regclass, 'estoque_atual') then 'coalesce(p.estoque_atual, 0)'
    else '0'
  end;

  v_min_expr := case when v_min_col is not null then format('coalesce(p.%I, 0)', v_min_col) else '0' end;
  v_max_expr := case when v_max_col is not null then format('nullif(coalesce(p.%I, 0), 0)', v_max_col) else 'null' end;

  if to_regclass('public.industria_mrp_parametros') is not null then
    v_join_params := 'left join public.industria_mrp_parametros mp on mp.empresa_id = p.empresa_id and mp.produto_id = p.id
                      left join public.pessoas f on f.id = mp.fornecedor_preferencial_id';
  end if;

  v_sql := format($fmt$
    with base as (
      select
        p.id as produto_id,
        p.nome,
        p.sku,
        coalesce(p.unidade, 'un') as unidade,
        %1$s::numeric as saldo,
        %2$s::numeric as estoque_min,
        coalesce(%3$s, %2$s)::numeric as estoque_max,
        %4$s as fornecedor_nome
      from public.produtos p
      %5$s
      %6$s
      where p.empresa_id = $1
        %7$s
        %8$s
        %9$s
        and (
          $2 is null
          or btrim($2) = ''
          or lower(p.nome) like '%%'||lower($2)||'%%'
          or lower(coalesce(p.sku,'')) like '%%'||lower($2)||'%%'
          or lower(coalesce(p.codigo,'')) like '%%'||lower($2)||'%%'
        )
    )
    select
      produto_id,
      nome,
      sku,
      unidade,
      saldo,
      estoque_min,
      estoque_max,
      greatest(0, estoque_max - saldo) as sugestao_compra,
      fornecedor_nome
    from base
    where saldo <= estoque_min
    order by (estoque_min - saldo) desc, nome asc
  $fmt$,
    v_saldo_expr,
    v_min_expr,
    v_max_expr,
    case when to_regclass('public.industria_mrp_parametros') is not null then 'f.nome' else 'null' end,
    case
      when to_regclass('public.estoque_saldos') is not null then 'left join public.estoque_saldos es on es.empresa_id = $1 and es.produto_id = p.id'
      else ''
    end,
    v_join_params,
    case
      when v_ctrl_col is not null then format('and coalesce(p.%I, true) = true', v_ctrl_col)
      else ''
    end,
    case
      when v_ativo_col is not null then format('and coalesce(p.%I, true) = true', v_ativo_col)
      else ''
    end,
    case
      when v_status_col is not null then format('and coalesce(p.%I::text, ''ativo'') not in (''inativo'',''cancelado'')', v_status_col)
      else ''
    end
  );

  return query execute v_sql using v_emp, p_search;
end;
$$;

revoke all on function public.suprimentos_relatorio_baixo_estoque(text) from public, anon;
grant execute on function public.suprimentos_relatorio_baixo_estoque(text) to authenticated, service_role;

commit;
