/*
  ECOMMERCE-WOO-01: Suporte inicial a WooCommerce (conexão)

  Objetivo:
  - Permitir provider = 'woo' na infra de integrações (ecommerces, jobs, links).
  - Armazenar credenciais Woo (consumer key/secret) em tabela protegida (service_role only).
  - Expor RPCs seguras para UI:
    - ecommerce_connections_list / upsert passam a aceitar 'woo'
    - ecommerce_connection_diagnostics passa a diagnosticar 'woo' (sem expor segredos)
    - ecommerce_woo_set_secrets grava CK/CS (security definer + permission guard)

  Segurança:
  - CK/CS nunca ficam em `public.ecommerces.config`.
  - CK/CS ficam em `public.ecommerce_connection_secrets` (RLS: service_role only, já existente).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Permitir provider 'woo' nos CHECK constraints do domínio e-commerce
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ecommerce_jobs
  DROP CONSTRAINT IF EXISTS ecommerce_jobs_provider_check;
ALTER TABLE public.ecommerce_jobs
  ADD CONSTRAINT ecommerce_jobs_provider_check CHECK (provider IN ('meli','shopee','woo','custom'));

ALTER TABLE IF EXISTS public.ecommerce_accounts
  DROP CONSTRAINT IF EXISTS ecommerce_accounts_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_accounts
  ADD CONSTRAINT ecommerce_accounts_provider_check CHECK (provider IN ('meli','shopee','woo','custom'));

ALTER TABLE IF EXISTS public.ecommerce_order_links
  DROP CONSTRAINT IF EXISTS ecommerce_order_links_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_order_links
  ADD CONSTRAINT ecommerce_order_links_provider_check CHECK (provider IN ('meli','shopee','woo','custom'));

ALTER TABLE IF EXISTS public.ecommerce_shipment_links
  DROP CONSTRAINT IF EXISTS ecommerce_shipment_links_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_shipment_links
  ADD CONSTRAINT ecommerce_shipment_links_provider_check CHECK (provider IN ('meli','shopee','woo','custom'));

-- ---------------------------------------------------------------------------
-- 2) Secrets: adicionar colunas específicas de Woo (service_role only)
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ecommerce_connection_secrets
  ADD COLUMN IF NOT EXISTS woo_consumer_key text,
  ADD COLUMN IF NOT EXISTS woo_consumer_secret text;

-- ---------------------------------------------------------------------------
-- 3) RPCs: aceitar 'woo' em list/upsert e diagnosticar sem expor segredos
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_connections_list();
CREATE FUNCTION public.ecommerce_connections_list()
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  provider text,
  nome text,
  status text,
  external_account_id text,
  config jsonb,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.empresa_id, e.provider, e.nome, e.status, e.external_account_id, e.config,
    e.connected_at, e.last_sync_at, e.last_error, e.created_at, e.updated_at
  FROM public.ecommerces e
  WHERE e.empresa_id = v_empresa
    AND e.provider IN ('meli','shopee','woo')
  ORDER BY e.provider ASC, e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connections_list() FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connections_list() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ecommerce_connections_upsert(text, text, text, text, jsonb);
CREATE FUNCTION public.ecommerce_connections_upsert(
  p_provider text,
  p_nome text,
  p_status text DEFAULT NULL,
  p_external_account_id text DEFAULT NULL,
  p_config jsonb DEFAULT NULL
)
RETURNS public.ecommerces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_row public.ecommerces;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_provider NOT IN ('meli','shopee','woo') THEN
    RAISE EXCEPTION 'provider inválido' USING errcode = '22023';
  END IF;

  INSERT INTO public.ecommerces (empresa_id, nome, provider, status, external_account_id, config, connected_at)
  VALUES (
    v_empresa,
    p_nome,
    p_provider,
    COALESCE(p_status, 'pending'),
    p_external_account_id,
    COALESCE(p_config, '{}'::jsonb),
    CASE WHEN COALESCE(p_status,'pending') = 'connected' THEN now() ELSE NULL END
  )
  ON CONFLICT (empresa_id, provider)
  DO UPDATE SET
    nome = EXCLUDED.nome,
    status = EXCLUDED.status,
    external_account_id = EXCLUDED.external_account_id,
    config = EXCLUDED.config,
    connected_at = CASE WHEN EXCLUDED.status = 'connected' THEN COALESCE(public.ecommerces.connected_at, now()) ELSE public.ecommerces.connected_at END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connections_upsert(text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connections_upsert(text, text, text, text, jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ecommerce_connection_diagnostics(text);
CREATE FUNCTION public.ecommerce_connection_diagnostics(p_provider text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_conn record;
  v_has_secret boolean := false;
  v_access_token_present boolean := false;
  v_refresh_token_present boolean := false;
  v_expires_at timestamptz := null;
  v_expired boolean := false;
  v_woo_ck_present boolean := false;
  v_woo_cs_present boolean := false;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_provider NOT IN ('meli','shopee','woo') THEN
    RAISE EXCEPTION 'provider inválido' USING errcode = '22023';
  END IF;

  SELECT
    e.id,
    e.empresa_id,
    e.provider,
    e.status,
    e.external_account_id,
    e.connected_at,
    e.last_sync_at,
    e.last_error,
    e.created_at,
    e.updated_at
  INTO v_conn
  FROM public.ecommerces e
  WHERE e.empresa_id = v_empresa
    AND e.provider = p_provider
  LIMIT 1;

  IF v_conn IS NOT NULL THEN
    SELECT true,
           (s.access_token IS NOT NULL AND length(s.access_token) > 0),
           (s.refresh_token IS NOT NULL AND length(s.refresh_token) > 0),
           s.token_expires_at,
           (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0),
           (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0)
    INTO v_has_secret, v_access_token_present, v_refresh_token_present, v_expires_at, v_woo_ck_present, v_woo_cs_present
    FROM public.ecommerce_connection_secrets s
    WHERE s.empresa_id = v_empresa
      AND s.ecommerce_id = v_conn.id
    LIMIT 1;

    v_expired := (v_expires_at IS NOT NULL AND v_expires_at <= now());
  END IF;

  RETURN jsonb_build_object(
    'provider', p_provider,
    'has_connection', (v_conn IS NOT NULL),
    'status', COALESCE(v_conn.status, 'disconnected'),
    'external_account_id', COALESCE(v_conn.external_account_id, NULL),
    'connected_at', COALESCE(v_conn.connected_at, NULL),
    'last_sync_at', COALESCE(v_conn.last_sync_at, NULL),
    'last_error', COALESCE(v_conn.last_error, NULL),
    -- token OAuth (meli/shopee)
    'has_token', CASE WHEN p_provider = 'woo' THEN COALESCE(v_woo_ck_present AND v_woo_cs_present, false) ELSE COALESCE(v_access_token_present, false) END,
    'has_refresh_token', CASE WHEN p_provider = 'woo' THEN false ELSE COALESCE(v_refresh_token_present, false) END,
    'token_expires_at', CASE WHEN p_provider = 'woo' THEN NULL ELSE v_expires_at END,
    'token_expired', CASE WHEN p_provider = 'woo' THEN false ELSE COALESCE(v_expired, false) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connection_diagnostics(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connection_diagnostics(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) RPC: gravar CK/CS Woo em ecommerce_connection_secrets (sem expor no front)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_woo_set_secrets(uuid, text, text);
CREATE FUNCTION public.ecommerce_woo_set_secrets(
  p_ecommerce_id uuid,
  p_consumer_key text,
  p_consumer_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_ecommerce_id IS NULL THEN
    RAISE EXCEPTION 'ecommerce_id inválido' USING errcode = '22023';
  END IF;

  SELECT e.provider INTO v_provider
  FROM public.ecommerces e
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
  LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Conexão não encontrada' USING errcode = 'P0002';
  END IF;
  IF v_provider <> 'woo' THEN
    RAISE EXCEPTION 'Conexão não é WooCommerce' USING errcode = '22023';
  END IF;

  INSERT INTO public.ecommerce_connection_secrets (
    empresa_id,
    ecommerce_id,
    provider,
    woo_consumer_key,
    woo_consumer_secret
  )
  VALUES (
    v_empresa,
    p_ecommerce_id,
    'woo',
    nullif(trim(coalesce(p_consumer_key,'')), ''),
    nullif(trim(coalesce(p_consumer_secret,'')), '')
  )
  ON CONFLICT (empresa_id, ecommerce_id)
  DO UPDATE SET
    provider = EXCLUDED.provider,
    woo_consumer_key = EXCLUDED.woo_consumer_key,
    woo_consumer_secret = EXCLUDED.woo_consumer_secret,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_set_secrets(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_set_secrets(uuid, text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

