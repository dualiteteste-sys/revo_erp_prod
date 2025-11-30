/*
  # Update search_items_for_os RPC
  
  Adds an optional parameter `p_only_sales` (default true) to filter products by `permitir_inclusao_vendas`.
  This allows searching for raw materials (insumos) in contexts like NFe Import or Manufacturing, while keeping the default behavior for Sales.
*/

-- Drop the old function signature to avoid ambiguity if we were just changing internals, 
-- but since we are changing arguments, we need to be careful. 
-- Postgres supports function overloading, so we should drop the old one to ensure we replace it.
DROP FUNCTION IF EXISTS public.search_items_for_os(text, integer);

CREATE OR REPLACE FUNCTION public.search_items_for_os(
  p_search text, 
  p_limit integer DEFAULT 20,
  p_only_sales boolean DEFAULT true,
  p_type text DEFAULT 'all' -- 'all', 'product', 'service'
)
RETURNS TABLE(id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
(
    SELECT
        p.id,
        'product' AS type,
        p.nome AS descricao,
        p.sku AS codigo,
        p.preco_venda
    FROM public.produtos p
    WHERE p.empresa_id = public.current_empresa_id()
      AND p.status = 'ativo'
      AND (p_only_sales = FALSE OR p.permitir_inclusao_vendas = TRUE)
      AND (p_type = 'all' OR p_type = 'product')
      AND (p_search IS NULL OR p.nome ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%')
)
UNION ALL
(
    SELECT
        s.id,
        'service' AS type,
        s.descricao,
        s.codigo,
        s.preco_venda::numeric
    FROM public.servicos s
    WHERE s.empresa_id = public.current_empresa_id()
      AND s.status = 'ativo'
      AND (p_type = 'all' OR p_type = 'service')
      AND (p_search IS NULL OR s.descricao ILIKE '%' || p_search || '%' OR s.codigo ILIKE '%' || p_search || '%')
)
ORDER BY descricao
LIMIT p_limit;
$function$;

REVOKE ALL ON FUNCTION public.search_items_for_os(text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_items_for_os(text, integer, boolean, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_items_for_os(text, integer, boolean, text)
IS 'Busca unificada por produtos e serviços. p_only_sales=true filtra apenas itens de venda. p_type filtra por tipo (product/service).';
