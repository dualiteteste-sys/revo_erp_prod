BEGIN;

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
  v_woo_verified_at timestamptz := null;
  v_woo_conn_status text := null;
  v_woo_conn_error text := null;
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
  ORDER BY
    CASE
      WHEN p_provider = 'woo'
        AND EXISTS (
          SELECT 1
          FROM public.ecommerce_connection_secrets s
          WHERE s.empresa_id = v_empresa
            AND s.ecommerce_id = e.id
            AND s.woo_consumer_key IS NOT NULL
            AND length(s.woo_consumer_key) > 0
            AND s.woo_consumer_secret IS NOT NULL
            AND length(s.woo_consumer_secret) > 0
        )
        AND e.status = 'connected'
      THEN 0
      WHEN p_provider = 'woo'
        AND EXISTS (
          SELECT 1
          FROM public.ecommerce_connection_secrets s
          WHERE s.empresa_id = v_empresa
            AND s.ecommerce_id = e.id
            AND s.woo_consumer_key IS NOT NULL
            AND length(s.woo_consumer_key) > 0
            AND s.woo_consumer_secret IS NOT NULL
            AND length(s.woo_consumer_secret) > 0
        )
      THEN 1
      WHEN p_provider = 'woo' AND e.status = 'connected' THEN 2
      WHEN p_provider = 'woo' AND e.status = 'pending' THEN 3
      WHEN p_provider = 'woo' AND e.status = 'error' THEN 4
      ELSE 5
    END,
    e.updated_at DESC NULLS LAST,
    e.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_conn IS NOT NULL THEN
    SELECT true,
           (s.access_token IS NOT NULL AND length(s.access_token) > 0),
           (s.refresh_token IS NOT NULL AND length(s.refresh_token) > 0),
           s.token_expires_at,
           (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0),
           (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0),
           s.woo_last_verified_at,
           s.woo_connection_status,
           s.woo_connection_error
    INTO v_has_secret, v_access_token_present, v_refresh_token_present, v_expires_at, v_woo_ck_present, v_woo_cs_present, v_woo_verified_at, v_woo_conn_status, v_woo_conn_error
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
    'connection_status',
      CASE
        WHEN p_provider = 'woo' THEN
          CASE
            WHEN v_conn IS NULL THEN 'pending'
            WHEN COALESCE(v_woo_ck_present, false) = false OR COALESCE(v_woo_cs_present, false) = false THEN 'pending'
            WHEN COALESCE(v_woo_conn_status, '') = 'connected' THEN 'connected'
            WHEN COALESCE(v_woo_conn_status, '') = 'error' THEN 'error'
            ELSE 'pending'
          END
        ELSE COALESCE(v_conn.status, 'disconnected')
      END,
    'error_message', CASE WHEN p_provider = 'woo' THEN v_woo_conn_error ELSE COALESCE(v_conn.last_error, NULL) END,
    'last_verified_at', CASE WHEN p_provider = 'woo' THEN v_woo_verified_at ELSE NULL END,
    'external_account_id', COALESCE(v_conn.external_account_id, NULL),
    'connected_at', COALESCE(v_conn.connected_at, NULL),
    'last_sync_at', COALESCE(v_conn.last_sync_at, NULL),
    'last_error', COALESCE(v_conn.last_error, NULL),
    'has_consumer_key', CASE WHEN p_provider = 'woo' THEN COALESCE(v_woo_ck_present, false) ELSE false END,
    'has_consumer_secret', CASE WHEN p_provider = 'woo' THEN COALESCE(v_woo_cs_present, false) ELSE false END,
    'has_token', CASE WHEN p_provider = 'woo' THEN COALESCE(v_woo_ck_present AND v_woo_cs_present, false) ELSE COALESCE(v_access_token_present, false) END,
    'has_refresh_token', CASE WHEN p_provider = 'woo' THEN false ELSE COALESCE(v_refresh_token_present, false) END,
    'token_expires_at', CASE WHEN p_provider = 'woo' THEN NULL ELSE v_expires_at END,
    'token_expired', CASE WHEN p_provider = 'woo' THEN false ELSE COALESCE(v_expired, false) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connection_diagnostics(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connection_diagnostics(text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
