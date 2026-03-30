-- Fix: hide parent products (that have variants) from search_items_for_os.
-- Parent products are not sellable individually — only their variants are.
-- Applies to both the 4-param __unsafe version (used by PDV, OS, Pedidos)
-- and the 3-param SQL version (unaccent fix).

-- ---------------------------------------------------------------------------
-- 1. Update the 4-param __unsafe version (dynamic SQL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_items_for_os__unsafe(
  p_search text,
  p_limit integer DEFAULT 20,
  p_only_sales boolean DEFAULT true,
  p_type text DEFAULT 'all'
)
RETURNS TABLE(id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_prod_filter text := '';
  v_sales_filter text := '';
  v_has_prod_status boolean;
  v_has_prod_ativo boolean;
  v_has_prod_allow_sales boolean;
  v_has_prod_pode_vender boolean;
  v_sql text;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][SEARCH_ITEMS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'status'
  ) INTO v_has_prod_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'ativo'
  ) INTO v_has_prod_ativo;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'permitir_inclusao_vendas'
  ) INTO v_has_prod_allow_sales;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'pode_vender'
  ) INTO v_has_prod_pode_vender;

  IF v_has_prod_status THEN
    v_prod_filter := v_prod_filter || ' AND p.status = ''ativo''';
  ELSIF v_has_prod_ativo THEN
    v_prod_filter := v_prod_filter || ' AND p.ativo = true';
  END IF;

  IF COALESCE(p_only_sales, true) THEN
    IF v_has_prod_allow_sales THEN
      v_sales_filter := v_sales_filter || ' AND p.permitir_inclusao_vendas = true';
    ELSIF v_has_prod_pode_vender THEN
      v_sales_filter := v_sales_filter || ' AND (p.pode_vender = true OR p.pode_vender IS NULL)';
    END IF;
  END IF;

  v_sql := format($fmt$
    (
      SELECT
        p.id,
        'product' AS type,
        p.nome AS descricao,
        p.sku AS codigo,
        p.preco_venda::numeric AS preco_venda
      FROM public.produtos p
      WHERE p.empresa_id = $1
        AND (coalesce($4,'all') = 'all' OR coalesce($4,'all') = 'product')
        %s
        %s
        AND ($2 IS NULL OR p.nome ILIKE '%%' || $2 || '%%' OR coalesce(p.sku,'') ILIKE '%%' || $2 || '%%')
        AND NOT EXISTS (
          SELECT 1 FROM public.produtos ch
          WHERE ch.produto_pai_id = p.id
          LIMIT 1
        )
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
      WHERE s.empresa_id = $1
        AND s.status = 'ativo'
        AND (coalesce($4,'all') = 'all' OR coalesce($4,'all') = 'service')
        AND ($2 IS NULL OR s.descricao ILIKE '%%' || $2 || '%%' OR coalesce(s.codigo,'') ILIKE '%%' || $2 || '%%')
    )
    ORDER BY descricao
    LIMIT $3
  $fmt$, v_prod_filter, v_sales_filter);

  RETURN QUERY EXECUTE v_sql USING v_empresa_id, p_search, greatest(COALESCE(p_limit, 20), 0), p_type;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update the 3-param SQL version (unaccent-enabled, from fix_unaccent_search)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_items_for_os(
  p_search text,
  p_limit integer DEFAULT 20,
  p_only_sales boolean DEFAULT true
)
RETURNS TABLE (id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
      AND (
        p_search IS NULL
        OR public.unaccent(p.nome) ILIKE '%' || public.unaccent(p_search) || '%'
        OR p.sku ILIKE '%' || p_search || '%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.produtos ch
        WHERE ch.produto_pai_id = p.id
        LIMIT 1
      )
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
      AND (
        p_search IS NULL
        OR public.unaccent(s.descricao) ILIKE '%' || public.unaccent(p_search) || '%'
        OR s.codigo ILIKE '%' || p_search || '%'
      )
)
ORDER BY descricao
LIMIT p_limit;
$$;
