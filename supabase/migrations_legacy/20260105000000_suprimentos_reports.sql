/*
  # Suprimentos - Relatórios Gerenciais

  ## Query Description
  Cria RPCs para relatórios de estoque:
  - Valorização de Estoque (com classificação ABC simples).
  - Sugestão de Compras (itens abaixo do mínimo).
  
  ## Impact Summary
  - Segurança: RPCs SECURITY DEFINER, RLS via current_empresa_id().
  - Performance: Consultas agregadas no banco para evitar processamento pesado no frontend.
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
  -- Calcula o valor total do estoque da empresa para base da Curva ABC
  select coalesce(sum(saldo * custo_medio), 0)
  into v_total_geral
  from public.produtos
  where empresa_id = v_empresa
    and status = 'ativo'
    and controla_estoque = true
    and saldo > 0;

  if v_total_geral = 0 then
    v_total_geral := 1; -- Evita divisão por zero
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
        or p.sku ilike '%'||p_search||'%'
      )
  ),
  dados_calc as (
    select
      *,
      (valor_total / v_total_geral) * 100 as percentual,
      sum(valor_total) over (order by valor_total desc) as soma_acumulada
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
  order by dc.valor_total desc;
end;
$$;

revoke all on function public.suprimentos_relatorio_valorizacao from public;
grant execute on function public.suprimentos_relatorio_valorizacao to authenticated, service_role;


-- =============================================
-- 2) Relatório de Baixo Estoque (Sugestão de Compra)
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
  select
    p.id as produto_id,
    p.nome,
    p.sku,
    p.unidade,
    p.saldo,
    p.estoque_min,
    p.estoque_max,
    case 
      when p.estoque_max > 0 then (p.estoque_max - p.saldo)
      else (coalesce(p.estoque_min, 0) - p.saldo) + (coalesce(p.estoque_min, 0) * 0.2) -- Sugere repor min + 20% se não tiver max
    end as sugestao_compra,
    (
      select f.nome 
      from public.produto_fornecedores pf
      join public.fornecedores f on f.id = pf.fornecedor_id
      where pf.produto_id = p.id
      limit 1
    ) as fornecedor_nome
  from public.produtos p
  where p.empresa_id = v_empresa
    and p.status = 'ativo'
    and p.controla_estoque = true
    and p.saldo <= coalesce(p.estoque_min, 0)
    and (
      p_search is null 
      or p.nome ilike '%'||p_search||'%' 
      or p.sku ilike '%'||p_search||'%'
    )
  order by (p.saldo - coalesce(p.estoque_min, 0)) asc; -- Mais críticos (negativos) primeiro
end;
$$;

revoke all on function public.suprimentos_relatorio_baixo_estoque from public;
grant execute on function public.suprimentos_relatorio_baixo_estoque to authenticated, service_role;
