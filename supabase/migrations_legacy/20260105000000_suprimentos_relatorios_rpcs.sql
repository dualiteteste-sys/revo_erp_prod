/*
  # Suprimentos - Relatórios Gerenciais (corrigido MT/RLS)

  - Isolamento: filtros explícitos por empresa_id em todas as leituras.
  - SECURITY DEFINER + search_path fixo.
  - Mantém assinaturas originais.
*/

-- =============================================
-- 1) Relatório de Valorização de Estoque + Curva ABC
-- =============================================
create or replace function public.suprimentos_relatorio_valorizacao(
  p_search text default null
)
returns table (
  produto_id   uuid,
  nome         text,
  sku          text,
  unidade      text,
  saldo        numeric,
  custo_medio  numeric,
  valor_total  numeric,
  percentual   numeric,
  acumulado    numeric,
  classe       text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total_geral numeric;
begin
  -- Total geral para base da ABC
  select coalesce(sum(p.saldo * p.custo_medio), 0)
  into v_total_geral
  from public.produtos p
  where p.empresa_id = v_empresa
    and p.status = 'ativo'
    and p.controla_estoque = true
    and p.saldo > 0;

  if v_total_geral = 0 then
    v_total_geral := 1; -- evita divisão por zero
  end if;

  return query
  with dados_base as (
    select
      p.id as produto_id,
      p.nome,
      p.sku,
      p.unidade,
      p.saldo,
      p.custo_medio,
      (p.saldo * p.custo_medio) as valor_total
    from public.produtos p
    where p.empresa_id = v_empresa
      and p.status = 'ativo'
      and p.controla_estoque = true
      and p.saldo > 0
      and (
        p_search is null 
        or p.nome ilike '%'||p_search||'%' 
        or p.sku  ilike '%'||p_search||'%'
      )
  ),
  dados_calc as (
    select
      *,
      (valor_total / v_total_geral) * 100 as percentual,
      sum(valor_total) over (order by valor_total desc, produto_id) as soma_acumulada
    from dados_base
  )
  select
    dc.produto_id,
    dc.nome,
    dc.sku,
    dc.unidade,
    dc.saldo,
    dc.custo_medio,
    dc.valor_total,
    dc.percentual,
    (dc.soma_acumulada / v_total_geral) * 100 as acumulado,
    case 
      when (dc.soma_acumulada / v_total_geral) <= 0.80 then 'A'
      when (dc.soma_acumulada / v_total_geral) <= 0.95 then 'B'
      else 'C'
    end as classe
  from dados_calc dc
  order by dc.valor_total desc, dc.produto_id;
end;
$$;

revoke all on function public.suprimentos_relatorio_valorizacao(text) from public;
grant execute on function public.suprimentos_relatorio_valorizacao(text) to authenticated, service_role;


-- =============================================
-- 2) Relatório de Baixo Estoque (Sugestão de Compra)
--    (com fornecedor filtrado por empresa)
-- =============================================
create or replace function public.suprimentos_relatorio_baixo_estoque(
  p_search text default null
)
returns table (
  produto_id      uuid,
  nome            text,
  sku             text,
  unidade         text,
  saldo           numeric,
  estoque_min     numeric,
  estoque_max     numeric,
  sugestao_compra numeric,
  fornecedor_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  return query
  with base as (
    select
      p.id        as produto_id,
      p.nome,
      p.sku,
      p.unidade,
      p.saldo,
      p.estoque_min,
      p.estoque_max
    from public.produtos p
    where p.empresa_id = v_empresa
      and p.status = 'ativo'
      and p.controla_estoque = true
      and p.saldo <= coalesce(p.estoque_min, 0)
      and (
        p_search is null 
        or p.nome ilike '%'||p_search||'%' 
        or p.sku  ilike '%'||p_search||'%'
      )
  ),
  fornecedor as (
    -- seleciona um fornecedor do produto dentro da mesma empresa
    select
      pf.produto_id,
      f.nome as fornecedor_nome,
      row_number() over (partition by pf.produto_id order by pf.created_at nulls last, pf.fornecedor_id) as rn
    from public.produto_fornecedores pf
    join public.fornecedores f
      on f.id = pf.fornecedor_id
     and f.empresa_id = v_empresa
    where pf.empresa_id = v_empresa
  )
  select
    b.produto_id,
    b.nome,
    b.sku,
    b.unidade,
    b.saldo,
    b.estoque_min,
    b.estoque_max,
    case 
      when coalesce(b.estoque_max, 0) > 0
        then greatest(b.estoque_max - b.saldo, 0)
      else greatest((coalesce(b.estoque_min, 0) - b.saldo) + (coalesce(b.estoque_min, 0) * 0.2), 0)
    end as sugestao_compra,
    fz.fornecedor_nome
  from base b
  left join fornecedor fz
    on fz.produto_id = b.produto_id
   and fz.rn = 1
  order by (b.saldo - coalesce(b.estoque_min, 0)) asc, b.nome;
end;
$$;

revoke all on function public.suprimentos_relatorio_baixo_estoque(text) from public;
grant execute on function public.suprimentos_relatorio_baixo_estoque(text) to authenticated, service_role;
