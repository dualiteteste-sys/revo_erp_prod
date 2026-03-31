/*
  MELI-PHASE4-CATALOG-RPC

  Nova RPC meli_catalog_list: retorna todos os anúncios ML da empresa
  com dados completos do produto para a UI do catálogo.
  Resolve o bug da MeliCatalogPage que chamava list_produto_anuncios_for_product(null).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- meli_catalog_list: lista anúncios ML com dados do produto
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.meli_catalog_list(text, text, int, int);

CREATE FUNCTION public.meli_catalog_list(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  anuncio_id uuid,
  produto_id uuid,
  produto_nome text,
  produto_sku text,
  titulo_ml text,
  identificador_externo text,
  url_anuncio text,
  preco_especifico numeric,
  preco_venda numeric,
  estoque_disponivel numeric,
  status_anuncio text,
  sync_status text,
  last_sync_at timestamptz,
  last_error text,
  categoria_marketplace text,
  ecommerce_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_ecommerce_id uuid;
  v_q text := nullif(trim(p_q), '');
  v_status text := nullif(trim(p_status), '');
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  SELECT e.id INTO v_ecommerce_id
  FROM public.ecommerces e
  WHERE e.empresa_id = v_empresa AND e.provider = 'meli'
  LIMIT 1;

  IF v_ecommerce_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id                    AS anuncio_id,
    p.id                    AS produto_id,
    p.nome                  AS produto_nome,
    p.sku                   AS produto_sku,
    a.titulo                AS titulo_ml,
    a.identificador_externo,
    a.url_anuncio,
    a.preco_especifico,
    p.preco_venda,
    p.estoque_disponivel,
    a.status_anuncio,
    a.sync_status,
    a.last_sync_at,
    a.last_error,
    a.categoria_marketplace,
    v_ecommerce_id          AS ecommerce_id
  FROM public.produto_anuncios a
  JOIN public.produtos p
    ON p.id = a.produto_id
   AND p.empresa_id = v_empresa
  WHERE a.empresa_id = v_empresa
    AND a.ecommerce_id = v_ecommerce_id
    AND (v_q IS NULL
         OR p.nome ILIKE '%' || v_q || '%'
         OR p.sku ILIKE '%' || v_q || '%'
         OR a.titulo ILIKE '%' || v_q || '%'
         OR a.identificador ILIKE '%' || v_q || '%')
    AND (v_status IS NULL OR a.sync_status = v_status)
  ORDER BY p.nome ASC
  LIMIT greatest(p_limit, 1)
  OFFSET greatest(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.meli_catalog_list(text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.meli_catalog_list(text, text, int, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
