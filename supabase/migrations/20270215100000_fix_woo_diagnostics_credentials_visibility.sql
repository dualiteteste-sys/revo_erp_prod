/*
  FIX-WOO-DIAG-01: Corrigir diagnóstico de credenciais Woo

  Problema:
  - Após salvar CK/CS com sucesso via ecommerce_woo_set_secrets_v2,
    a RPC ecommerce_connection_diagnostics retorna has_consumer_key: false.
  - Isso faz a UI mostrar "Consumer Key não armazenada" mesmo com dados gravados.
  - O test-connection (Edge Function com service_role) consegue ler os segredos normalmente.

  Causa raiz:
  - ecommerce_connection_diagnostics é SECURITY DEFINER mas pode estar com versão
    desatualizada em produção (sem os campos woo_consumer_key/has_consumer_secret).
  - Possível inconsistência entre a constraint UNIQUE e os ON CONFLICT clauses.

  Esta migração é idempotente e garante que:
  1. As colunas woo_consumer_key e woo_consumer_secret existam na tabela.
  2. As colunas de verificação de conexão existam (woo_last_verified_at, etc).
  3. A constraint UNIQUE em ecommerce_id esteja presente.
  4. A função ecommerce_connection_diagnostics retorne has_consumer_key e has_consumer_secret.
  5. A função ecommerce_woo_set_secrets_v2 use a constraint correta.
  6. A função ecommerce_woo_connection_context exista para o edge function.
  7. A função ecommerce_woo_record_connection_check exista para persistir resultados.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Garantir colunas na tabela ecommerce_connection_secrets
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ecommerce_connection_secrets
  ADD COLUMN IF NOT EXISTS woo_consumer_key text,
  ADD COLUMN IF NOT EXISTS woo_consumer_secret text,
  ADD COLUMN IF NOT EXISTS woo_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS woo_connection_status text,
  ADD COLUMN IF NOT EXISTS woo_connection_error text,
  ADD COLUMN IF NOT EXISTS woo_last_http_status integer,
  ADD COLUMN IF NOT EXISTS woo_last_endpoint text,
  ADD COLUMN IF NOT EXISTS woo_last_latency_ms integer;

-- Garantir constraint de status válido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ecommerce_connection_secrets_woo_connection_status_check'
  ) THEN
    ALTER TABLE public.ecommerce_connection_secrets
      ADD CONSTRAINT ecommerce_connection_secrets_woo_connection_status_check
      CHECK (woo_connection_status IS NULL OR woo_connection_status IN ('pending', 'connected', 'error'));
  END IF;
END $$;

-- Garantir constraint UNIQUE em ecommerce_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ecommerce_connection_secrets_unique'
      AND conrelid = 'public.ecommerce_connection_secrets'::regclass
  ) THEN
    ALTER TABLE public.ecommerce_connection_secrets
      ADD CONSTRAINT ecommerce_connection_secrets_unique UNIQUE (ecommerce_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) ecommerce_connection_diagnostics — versão DEFINITIVA
--    Retorna has_consumer_key e has_consumer_secret para provider 'woo'
-- ---------------------------------------------------------------------------
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
    WHERE s.ecommerce_id = v_conn.id
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

-- ---------------------------------------------------------------------------
-- 3) ecommerce_woo_set_secrets_v2 — versão DEFINITIVA
--    Usa ON CONFLICT (ecommerce_id) — constraint correta
--    Filtro WHERE apenas em ecommerce_id (sem empresa_id) para consistência
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_woo_set_secrets_v2(uuid, text, text);
CREATE FUNCTION public.ecommerce_woo_set_secrets_v2(
  p_ecommerce_id uuid,
  p_consumer_key text,
  p_consumer_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text;
  v_ck text := nullif(trim(coalesce(p_consumer_key, '')), '');
  v_cs text := nullif(trim(coalesce(p_consumer_secret, '')), '');
  v_has_ck boolean := false;
  v_has_cs boolean := false;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_ecommerce_id IS NULL THEN
    RAISE EXCEPTION 'ecommerce_id inválido' USING errcode = '22023';
  END IF;
  IF v_ck IS NULL OR v_cs IS NULL THEN
    RAISE EXCEPTION 'Credenciais inválidas' USING errcode = '22023';
  END IF;

  SELECT e.provider INTO v_provider
  FROM public.ecommerces e
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
  LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Conexão Woo não encontrada para a empresa ativa. Recarregue a página e tente novamente.' USING errcode = '22023';
  END IF;
  IF v_provider <> 'woo' THEN
    RAISE EXCEPTION 'Conexão não é WooCommerce' USING errcode = '22023';
  END IF;

  INSERT INTO public.ecommerce_connection_secrets (
    empresa_id,
    ecommerce_id,
    woo_consumer_key,
    woo_consumer_secret,
    woo_last_verified_at,
    woo_connection_status,
    woo_connection_error,
    woo_last_http_status,
    woo_last_endpoint,
    woo_last_latency_ms
  )
  VALUES (
    v_empresa,
    p_ecommerce_id,
    v_ck,
    v_cs,
    NULL,
    'pending',
    NULL,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (ecommerce_id)
  DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    woo_consumer_key = EXCLUDED.woo_consumer_key,
    woo_consumer_secret = EXCLUDED.woo_consumer_secret,
    woo_last_verified_at = EXCLUDED.woo_last_verified_at,
    woo_connection_status = EXCLUDED.woo_connection_status,
    woo_connection_error = EXCLUDED.woo_connection_error,
    woo_last_http_status = EXCLUDED.woo_last_http_status,
    woo_last_endpoint = EXCLUDED.woo_last_endpoint,
    woo_last_latency_ms = EXCLUDED.woo_last_latency_ms,
    updated_at = now();

  UPDATE public.ecommerces e
  SET
    status = 'pending',
    last_error = NULL,
    updated_at = now()
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
    AND e.provider = 'woo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conexão Woo não encontrada para a empresa ativa. Recarregue a página e tente novamente.' USING errcode = '22023';
  END IF;

  -- Confirmação: ler de volta para verificar persistência
  SELECT
    (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0),
    (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0)
  INTO v_has_ck, v_has_cs
  FROM public.ecommerce_connection_secrets s
  WHERE s.ecommerce_id = p_ecommerce_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'has_consumer_key', COALESCE(v_has_ck, false),
    'has_consumer_secret', COALESCE(v_has_cs, false),
    'connection_status', 'pending',
    'last_verified_at', NULL,
    'error_message', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_set_secrets_v2(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_set_secrets_v2(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) ecommerce_woo_connection_context — contexto seguro para Edge Functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_woo_connection_context(uuid);
CREATE FUNCTION public.ecommerce_woo_connection_context(p_ecommerce_id uuid)
RETURNS TABLE (
  ecommerce_id uuid,
  empresa_id uuid,
  store_url text,
  has_consumer_key boolean,
  has_consumer_secret boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_ecommerce_id IS NULL THEN
    RAISE EXCEPTION 'ecommerce_id inválido' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.empresa_id,
    nullif(trim(coalesce(e.config->>'store_url', '')), '') AS store_url,
    COALESCE((s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0), false) AS has_consumer_key,
    COALESCE((s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0), false) AS has_consumer_secret
  FROM public.ecommerces e
  LEFT JOIN public.ecommerce_connection_secrets s
    ON s.ecommerce_id = e.id
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
    AND e.provider = 'woo'
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_connection_context(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_connection_context(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) ecommerce_woo_record_connection_check — persistir resultado de teste
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_woo_record_connection_check(uuid, text, text, integer, text, integer);
CREATE FUNCTION public.ecommerce_woo_record_connection_check(
  p_ecommerce_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_http_status integer DEFAULT NULL,
  p_endpoint text DEFAULT NULL,
  p_latency_ms integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid;
  v_now timestamptz := now();
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_ecommerce_id IS NULL THEN
    RAISE EXCEPTION 'ecommerce_id inválido' USING errcode = '22023';
  END IF;

  IF p_status NOT IN ('pending', 'connected', 'error') THEN
    RAISE EXCEPTION 'status inválido' USING errcode = '22023';
  END IF;

  SELECT e.empresa_id
    INTO v_empresa
  FROM public.ecommerces e
  WHERE e.id = p_ecommerce_id
    AND e.provider = 'woo'
  LIMIT 1;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Conexão Woo não encontrada' USING errcode = 'P0002';
  END IF;

  -- Atualizar apenas os campos de verificação, sem tocar nos segredos (CK/CS)
  UPDATE public.ecommerce_connection_secrets
  SET
    woo_last_verified_at = v_now,
    woo_connection_status = p_status,
    woo_connection_error = CASE WHEN p_status = 'connected' THEN NULL ELSE nullif(trim(coalesce(p_error, '')), '') END,
    woo_last_http_status = p_http_status,
    woo_last_endpoint = nullif(trim(coalesce(p_endpoint, '')), ''),
    woo_last_latency_ms = p_latency_ms,
    updated_at = now()
  WHERE ecommerce_id = p_ecommerce_id;

  -- Se não existir registro de secrets ainda, criar com apenas os campos de verificação
  IF NOT FOUND THEN
    INSERT INTO public.ecommerce_connection_secrets (
      empresa_id,
      ecommerce_id,
      woo_last_verified_at,
      woo_connection_status,
      woo_connection_error,
      woo_last_http_status,
      woo_last_endpoint,
      woo_last_latency_ms
    )
    VALUES (
      v_empresa,
      p_ecommerce_id,
      v_now,
      p_status,
      CASE WHEN p_status = 'connected' THEN NULL ELSE nullif(trim(coalesce(p_error, '')), '') END,
      p_http_status,
      nullif(trim(coalesce(p_endpoint, '')), ''),
      p_latency_ms
    );
  END IF;

  UPDATE public.ecommerces e
  SET
    status = CASE
      WHEN p_status = 'connected' THEN 'connected'
      WHEN p_status = 'error' THEN 'error'
      ELSE 'pending'
    END,
    last_error = CASE
      WHEN p_status = 'connected' THEN NULL
      ELSE nullif(trim(coalesce(p_error, '')), '')
    END,
    connected_at = CASE
      WHEN p_status = 'connected' THEN COALESCE(e.connected_at, v_now)
      ELSE e.connected_at
    END,
    updated_at = now()
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
    AND e.provider = 'woo';
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_record_connection_check(uuid, text, text, integer, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_record_connection_check(uuid, text, text, integer, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) ecommerce_woo_set_store_url — persistir URL (somente config.store_url)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ecommerce_woo_set_store_url(uuid, text);
CREATE FUNCTION public.ecommerce_woo_set_store_url(
  p_ecommerce_id uuid,
  p_store_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text;
  v_raw text;
  v_url text;
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
    RAISE EXCEPTION 'Conexão Woo não encontrada para a empresa ativa. Recarregue a página e tente novamente.' USING errcode = '22023';
  END IF;
  IF v_provider <> 'woo' THEN
    RAISE EXCEPTION 'Conexão não é WooCommerce' USING errcode = '22023';
  END IF;

  v_raw := trim(coalesce(p_store_url, ''));
  IF v_raw = '' THEN
    RAISE EXCEPTION 'store_url_required' USING errcode = '22023';
  END IF;

  v_url := CASE
    WHEN v_raw ~* '^https?://' THEN v_raw
    ELSE 'https://' || v_raw
  END;

  v_url := split_part(v_url, '#', 1);
  v_url := split_part(v_url, '?', 1);
  v_url := regexp_replace(v_url, '/+$', '');

  IF v_url !~* '^https?://[^\s]+' THEN
    RAISE EXCEPTION 'store_url_invalid' USING errcode = '22023';
  END IF;

  UPDATE public.ecommerces e
  SET
    config = jsonb_set(coalesce(e.config, '{}'::jsonb), '{store_url}', to_jsonb(v_url), true),
    updated_at = now()
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
    AND e.provider = 'woo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conexão Woo não encontrada para a empresa ativa. Recarregue a página e tente novamente.' USING errcode = '22023';
  END IF;

  RETURN jsonb_build_object('store_url', v_url);
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_set_store_url(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_set_store_url(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Notificar PostgREST para recarregar schema
-- ---------------------------------------------------------------------------
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
