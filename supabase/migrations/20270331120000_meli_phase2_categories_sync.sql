-- =====================================================================
-- Migration: Mercado Livre Phase 2 — Categories, Attributes, Webhooks
-- =====================================================================

-- =====================================================================
-- 1. MELI CATEGORIES CACHE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meli_categories_cache (
  id text NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id text,
  path_from_root jsonb DEFAULT '[]'::jsonb,
  has_children boolean DEFAULT false,
  attributes_snapshot jsonb DEFAULT '[]'::jsonb,
  picture text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, id)
);

ALTER TABLE public.meli_categories_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meli_categories_cache_select ON public.meli_categories_cache;
CREATE POLICY meli_categories_cache_select ON public.meli_categories_cache
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS meli_categories_cache_service ON public.meli_categories_cache;
CREATE POLICY meli_categories_cache_service ON public.meli_categories_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.meli_categories_cache TO authenticated;
GRANT ALL ON TABLE public.meli_categories_cache TO service_role;

CREATE INDEX IF NOT EXISTS idx_meli_categories_cache_name
  ON public.meli_categories_cache (empresa_id, name text_pattern_ops);

-- =====================================================================
-- 2. MELI CATEGORY MAPPINGS (grupo interno → categoria ML)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meli_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.produto_grupos(id) ON DELETE SET NULL,
  meli_category_id text NOT NULL,
  meli_category_name text,
  meli_category_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.meli_category_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.meli_category_mappings
    ADD CONSTRAINT meli_category_mappings_unique UNIQUE (empresa_id, grupo_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS meli_category_mappings_select ON public.meli_category_mappings;
CREATE POLICY meli_category_mappings_select ON public.meli_category_mappings
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS meli_category_mappings_service ON public.meli_category_mappings;
CREATE POLICY meli_category_mappings_service ON public.meli_category_mappings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.meli_category_mappings TO authenticated;
GRANT ALL ON TABLE public.meli_category_mappings TO service_role;

-- =====================================================================
-- 3. MELI LISTING ATTRIBUTES (atributos ML por anúncio)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meli_listing_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_anuncio_id uuid NOT NULL REFERENCES public.produto_anuncios(id) ON DELETE CASCADE,
  attribute_id text NOT NULL,
  attribute_name text,
  value_id text,
  value_name text NOT NULL
);

ALTER TABLE public.meli_listing_attributes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.meli_listing_attributes
    ADD CONSTRAINT meli_listing_attributes_unique UNIQUE (produto_anuncio_id, attribute_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS meli_listing_attributes_select ON public.meli_listing_attributes;
CREATE POLICY meli_listing_attributes_select ON public.meli_listing_attributes
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS meli_listing_attributes_service ON public.meli_listing_attributes;
CREATE POLICY meli_listing_attributes_service ON public.meli_listing_attributes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.meli_listing_attributes TO authenticated;
GRANT ALL ON TABLE public.meli_listing_attributes TO service_role;

-- =====================================================================
-- 4. MELI WEBHOOK EVENTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meli_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  ecommerce_id uuid NOT NULL,
  notification_id text,
  topic text NOT NULL,
  resource text,
  user_id text,
  application_id text,
  process_status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.meli_webhook_events
    ADD CONSTRAINT meli_webhook_events_status_check
    CHECK (process_status IN ('pending','processing','done','error','ignored'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.meli_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meli_webhook_events_select ON public.meli_webhook_events;
CREATE POLICY meli_webhook_events_select ON public.meli_webhook_events
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS meli_webhook_events_service ON public.meli_webhook_events;
CREATE POLICY meli_webhook_events_service ON public.meli_webhook_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.meli_webhook_events TO authenticated;
GRANT ALL ON TABLE public.meli_webhook_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_meli_webhook_events_pending
  ON public.meli_webhook_events (empresa_id, process_status)
  WHERE process_status = 'pending';

-- =====================================================================
-- 5. COLUNA meli_listing_type_id EM produto_anuncios
-- =====================================================================

ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS meli_listing_type_id text;

-- =====================================================================
-- 6. RPCs DE CATEGORIAS ML
-- =====================================================================

-- 6.1 Search categories from cache
CREATE OR REPLACE FUNCTION public.meli_categories_search(
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  id text,
  name text,
  path_from_root jsonb,
  has_children boolean,
  picture text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');
  RETURN QUERY
  SELECT c.id, c.name, c.path_from_root, c.has_children, c.picture
  FROM public.meli_categories_cache c
  WHERE c.empresa_id = public.current_empresa_id()
    AND (p_query IS NULL OR c.name ILIKE '%' || p_query || '%')
  ORDER BY c.name
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.meli_categories_search(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_categories_search(text, int) TO authenticated, service_role;

-- 6.2 Get category detail with attributes
CREATE OR REPLACE FUNCTION public.meli_category_get(p_category_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');

  SELECT to_jsonb(c.*) INTO v_result
  FROM public.meli_categories_cache c
  WHERE c.empresa_id = public.current_empresa_id()
    AND c.id = p_category_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.meli_category_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_category_get(text) TO authenticated, service_role;

-- =====================================================================
-- 7. RPCs DE MAPEAMENTO GRUPO → CATEGORIA ML
-- =====================================================================

-- 7.1 Upsert mapping
CREATE OR REPLACE FUNCTION public.meli_category_mapping_upsert(
  p_grupo_id uuid,
  p_meli_category_id text,
  p_meli_name text DEFAULT NULL,
  p_meli_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  INSERT INTO public.meli_category_mappings (empresa_id, grupo_id, meli_category_id, meli_category_name, meli_category_path)
  VALUES (v_empresa, p_grupo_id, p_meli_category_id, p_meli_name, p_meli_path)
  ON CONFLICT (empresa_id, grupo_id) DO UPDATE SET
    meli_category_id = EXCLUDED.meli_category_id,
    meli_category_name = EXCLUDED.meli_category_name,
    meli_category_path = EXCLUDED.meli_category_path,
    updated_at = now()
  RETURNING id INTO v_id;

  SELECT to_jsonb(m.*) INTO v_result
  FROM public.meli_category_mappings m WHERE m.id = v_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.meli_category_mapping_upsert(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_category_mapping_upsert(uuid, text, text, text) TO authenticated, service_role;

-- 7.2 List mappings
CREATE OR REPLACE FUNCTION public.meli_category_mappings_list()
RETURNS TABLE(
  id uuid,
  grupo_id uuid,
  grupo_nome text,
  meli_category_id text,
  meli_category_name text,
  meli_category_path text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');
  RETURN QUERY
  SELECT m.id, m.grupo_id, g.nome AS grupo_nome,
         m.meli_category_id, m.meli_category_name, m.meli_category_path
  FROM public.meli_category_mappings m
  LEFT JOIN public.produto_grupos g ON g.id = m.grupo_id AND g.empresa_id = m.empresa_id
  WHERE m.empresa_id = public.current_empresa_id()
  ORDER BY g.nome NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.meli_category_mappings_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_category_mappings_list() TO authenticated, service_role;

-- 7.3 Delete mapping
CREATE OR REPLACE FUNCTION public.meli_category_mapping_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');
  DELETE FROM public.meli_category_mappings
  WHERE id = p_id AND empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.meli_category_mapping_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_category_mapping_delete(uuid) TO authenticated, service_role;

-- =====================================================================
-- 8. RPCs DE ATRIBUTOS POR LISTING
-- =====================================================================

-- 8.1 Upsert attributes (batch)
CREATE OR REPLACE FUNCTION public.meli_listing_attributes_upsert(
  p_produto_anuncio_id uuid,
  p_attributes jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_attr jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  -- Validate anuncio belongs to current empresa
  IF NOT EXISTS (
    SELECT 1 FROM public.produto_anuncios
    WHERE id = p_produto_anuncio_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Anúncio não encontrado.' USING errcode = '42501';
  END IF;

  -- Delete existing attributes for this listing
  DELETE FROM public.meli_listing_attributes
  WHERE produto_anuncio_id = p_produto_anuncio_id AND empresa_id = v_empresa;

  -- Insert new attributes
  FOR v_attr IN SELECT jsonb_array_elements(p_attributes) LOOP
    INSERT INTO public.meli_listing_attributes (
      empresa_id, produto_anuncio_id, attribute_id, attribute_name, value_id, value_name
    ) VALUES (
      v_empresa,
      p_produto_anuncio_id,
      v_attr->>'attribute_id',
      v_attr->>'attribute_name',
      v_attr->>'value_id',
      v_attr->>'value_name'
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.meli_listing_attributes_upsert(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_listing_attributes_upsert(uuid, jsonb) TO authenticated, service_role;

-- 8.2 List attributes for listing
CREATE OR REPLACE FUNCTION public.meli_listing_attributes_list(p_produto_anuncio_id uuid)
RETURNS TABLE(
  attribute_id text,
  attribute_name text,
  value_id text,
  value_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');
  RETURN QUERY
  SELECT a.attribute_id, a.attribute_name, a.value_id, a.value_name
  FROM public.meli_listing_attributes a
  WHERE a.produto_anuncio_id = p_produto_anuncio_id
    AND a.empresa_id = public.current_empresa_id()
  ORDER BY a.attribute_name;
END;
$$;

REVOKE ALL ON FUNCTION public.meli_listing_attributes_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_listing_attributes_list(uuid) TO authenticated, service_role;

-- =====================================================================
-- 9. RPC: MELI WEBHOOK EVENTS — list recent
-- =====================================================================

CREATE OR REPLACE FUNCTION public.meli_webhook_events_list(
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  topic text,
  resource text,
  process_status text,
  received_at timestamptz,
  processed_at timestamptz,
  last_error text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');
  RETURN QUERY
  SELECT e.id, e.topic, e.resource, e.process_status,
         e.received_at, e.processed_at, e.last_error
  FROM public.meli_webhook_events e
  WHERE e.empresa_id = public.current_empresa_id()
    AND (p_status IS NULL OR e.process_status = p_status)
  ORDER BY e.received_at DESC
  LIMIT LEAST(p_limit, 200);
END;
$$;

REVOKE ALL ON FUNCTION public.meli_webhook_events_list(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_webhook_events_list(text, int) TO authenticated, service_role;

-- =====================================================================
-- 10. RPC: MELI HEALTH SUMMARY
-- =====================================================================

CREATE OR REPLACE FUNCTION public.meli_health_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_active_listings int;
  v_paused_listings int;
  v_error_listings int;
  v_pending_webhooks int;
  v_last_sync timestamptz;
  v_connection_status text;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');

  -- Count listings by status
  SELECT
    COUNT(*) FILTER (WHERE pa.status_anuncio = 'ativo'),
    COUNT(*) FILTER (WHERE pa.status_anuncio = 'pausado'),
    COUNT(*) FILTER (WHERE pa.sync_status = 'error'),
    MAX(pa.last_sync_at)
  INTO v_active_listings, v_paused_listings, v_error_listings, v_last_sync
  FROM public.produto_anuncios pa
  JOIN public.ecommerces e ON e.id = pa.ecommerce_id
  WHERE pa.empresa_id = v_empresa
    AND e.provider = 'meli'
    AND pa.identificador_externo IS NOT NULL;

  -- Count pending webhooks
  SELECT COUNT(*) INTO v_pending_webhooks
  FROM public.meli_webhook_events
  WHERE empresa_id = v_empresa AND process_status = 'pending';

  -- Connection status
  SELECT ec.status INTO v_connection_status
  FROM public.ecommerces ec
  WHERE ec.empresa_id = v_empresa AND ec.provider = 'meli'
  LIMIT 1;

  RETURN jsonb_build_object(
    'connection_status', COALESCE(v_connection_status, 'disconnected'),
    'active_listings', COALESCE(v_active_listings, 0),
    'paused_listings', COALESCE(v_paused_listings, 0),
    'error_listings', COALESCE(v_error_listings, 0),
    'pending_webhooks', COALESCE(v_pending_webhooks, 0),
    'last_sync_at', v_last_sync
  );
END;
$$;

REVOKE ALL ON FUNCTION public.meli_health_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meli_health_summary() TO authenticated, service_role;
