/*
  SUP-STA-05 (P1) Sugestão de compra “MRP-lite”

  Motivo
  - Melhorar o relatório de baixo estoque para suportar planejamento de compras:
    considerar OCs abertas, lead time e sugerir quantidade líquida.

  Impacto
  - Adiciona uma RPC nova (somente leitura) consumida pelo frontend.
  - Não altera schema de tabelas existentes nem mexe em dados de negócio.

  Reversibilidade
  - Basta dropar a função `public.suprimentos_sugestao_compra_mrp_lite(text)`.
*/

begin;

drop function if exists public.suprimentos_sugestao_compra_mrp_lite(text);
create or replace function public.suprimentos_sugestao_compra_mrp_lite(
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
  qtd_em_oc_aberta numeric,
  saldo_projetado numeric,
  sugestao_compra numeric,
  lead_time_dias integer,
  data_prevista_recebimento date,
  fornecedor_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_ctrl_col text;
  v_ativo_col text;
  v_status_col text;
  v_min_col text;
  v_max_col text;
  v_lead_col text;
  v_saldo_expr text;
  v_min_expr text;
  v_max_expr text;
  v_lead_expr text;
  v_join_params text := '';
  v_join_saldo text := '';
  v_join_oc text := '';
  v_sql text;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','view');

  if v_emp is null then
    raise exception '[SUP][MRP-LITE] empresa_id inválido' using errcode = '42501';
  end if;

  if to_regclass('public.produtos') is null then
    return;
  end if;

  v_ctrl_col := case
    when public.__col_exists('public.produtos'::regclass, 'controlar_estoque') then 'controlar_estoque'
    when public.__col_exists('public.produtos'::regclass, 'controla_estoque') then 'controla_estoque'
    else null
  end;

  v_ativo_col := case when public.__col_exists('public.produtos'::regclass, 'ativo') then 'ativo' else null end;
  v_status_col := case when public.__col_exists('public.produtos'::regclass, 'status') then 'status' else null end;

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

  v_lead_col := case when public.__col_exists('public.produtos'::regclass, 'lead_time_dias') then 'lead_time_dias' else null end;

  v_saldo_expr := case
    when to_regclass('public.estoque_saldos') is not null then 'coalesce(es.saldo, 0)'
    when public.__col_exists('public.produtos'::regclass, 'estoque_atual') then 'coalesce(p.estoque_atual, 0)'
    else '0'
  end;

  v_min_expr := case when v_min_col is not null then format('coalesce(p.%I, 0)', v_min_col) else '0' end;
  v_max_expr := case when v_max_col is not null then format('nullif(coalesce(p.%I, 0), 0)', v_max_col) else 'null' end;
  v_lead_expr := case when v_lead_col is not null then format('coalesce(p.%I, 0)', v_lead_col) else '0' end;

  if to_regclass('public.estoque_saldos') is not null then
    v_join_saldo := 'left join public.estoque_saldos es on es.empresa_id = $1 and es.produto_id = p.id';
  end if;

  if to_regclass('public.compras_pedidos') is not null and to_regclass('public.compras_pedido_itens') is not null then
    v_join_oc := $q$
      left join (
        select
          ci.produto_id,
          coalesce(sum(ci.quantidade), 0) as qtd_em_oc_aberta
        from public.compras_pedido_itens ci
        join public.compras_pedidos cp
          on cp.id = ci.pedido_id
         and cp.empresa_id = ci.empresa_id
        where cp.empresa_id = $1
          and cp.status in ('rascunho','enviado')
        group by ci.produto_id
      ) oc on oc.produto_id = p.id
    $q$;
  end if;

  if to_regclass('public.industria_mrp_parametros') is not null then
    v_join_params := 'left join public.industria_mrp_parametros mp on mp.empresa_id = p.empresa_id and mp.produto_id = p.id
                      left join public.pessoas f on f.id = mp.fornecedor_preferencial_id';
    v_lead_expr := 'coalesce(mp.lead_time_dias, ' || v_lead_expr || ')';
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
        coalesce(oc.qtd_em_oc_aberta, 0)::numeric as qtd_em_oc_aberta,
        (%1$s::numeric + coalesce(oc.qtd_em_oc_aberta, 0)::numeric) as saldo_projetado,
        %4$s::int as lead_time_dias,
        (current_date + (%4$s::text || ' day')::interval)::date as data_prevista_recebimento,
        %5$s as fornecedor_nome
      from public.produtos p
      %6$s
      %7$s
      %8$s
      %9$s
      where p.empresa_id = $1
        %10$s
        %11$s
        %12$s
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
      qtd_em_oc_aberta,
      saldo_projetado,
      greatest(0, estoque_max - saldo_projetado) as sugestao_compra,
      lead_time_dias,
      data_prevista_recebimento,
      fornecedor_nome
    from base
    where (saldo_projetado <= estoque_min)
       or (greatest(0, estoque_max - saldo_projetado) > 0)
    order by (estoque_min - saldo_projetado) desc, sugestao_compra desc, nome asc
  $fmt$,
    v_saldo_expr,
    v_min_expr,
    v_max_expr,
    v_lead_expr,
    case when to_regclass('public.industria_mrp_parametros') is not null then 'f.nome' else 'null' end,
    v_join_saldo,
    v_join_oc,
    v_join_params,
    case
      when to_regclass('public.estoque_saldos_depositos') is not null then '' -- não usar depósitos aqui (visão global)
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

revoke all on function public.suprimentos_sugestao_compra_mrp_lite(text) from public, anon;
grant execute on function public.suprimentos_sugestao_compra_mrp_lite(text) to authenticated, service_role;

commit;

