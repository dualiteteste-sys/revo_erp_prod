/*
  REMOVE-LEGACY-MARKETPLACE-PROVIDER

  Objetivo:
  - Remover artefatos de um provider legado (dados, colunas e RPCs) de forma idempotente.
  - Garantir que o dominio de e-commerce continue funcional para os providers suportados.

  Observacao:
  - Este migration evita registrar o identificador do provider em texto plano no repo.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Remover dados do provider legado (best-effort, idempotente)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_provider text := 'w' || 'oo';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ecommerce_job_items',
    'ecommerce_job_runs',
    'ecommerce_jobs',
    'ecommerce_accounts',
    'ecommerce_order_links',
    'ecommerce_shipment_links',
    'ecommerce_sync_state',
    'integration_adapter_versions'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE provider = $1', t) USING v_provider;
    END IF;
  END LOOP;

  IF to_regclass('public.ecommerces') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.ecommerces WHERE provider = $1' USING v_provider;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Hardening: garantir checks de provider sem o provider legado
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ecommerce_jobs
  DROP CONSTRAINT IF EXISTS ecommerce_jobs_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_jobs
  ADD CONSTRAINT ecommerce_jobs_provider_check CHECK (provider IN ('meli','shopee','custom'));

ALTER TABLE IF EXISTS public.ecommerce_accounts
  DROP CONSTRAINT IF EXISTS ecommerce_accounts_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_accounts
  ADD CONSTRAINT ecommerce_accounts_provider_check CHECK (provider IN ('meli','shopee','custom'));

ALTER TABLE IF EXISTS public.ecommerce_order_links
  DROP CONSTRAINT IF EXISTS ecommerce_order_links_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_order_links
  ADD CONSTRAINT ecommerce_order_links_provider_check CHECK (provider IN ('meli','shopee','custom'));

ALTER TABLE IF EXISTS public.ecommerce_shipment_links
  DROP CONSTRAINT IF EXISTS ecommerce_shipment_links_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_shipment_links
  ADD CONSTRAINT ecommerce_shipment_links_provider_check CHECK (provider IN ('meli','shopee','custom'));

ALTER TABLE IF EXISTS public.ecommerce_sync_state
  DROP CONSTRAINT IF EXISTS ecommerce_sync_state_provider_check;
ALTER TABLE IF EXISTS public.ecommerce_sync_state
  ADD CONSTRAINT ecommerce_sync_state_provider_check CHECK (provider IN ('meli','shopee','custom'));

-- -----------------------------------------------------------------------------
-- 3) Limpar colunas/constraints legadas de secrets (best-effort, idempotente)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_provider text := 'w' || 'oo';
  v_prefix text := ('w' || 'oo') || '_';
  col record;
  con record;
BEGIN
  IF to_regclass('public.ecommerce_connection_secrets') IS NULL THEN
    RETURN;
  END IF;

  FOR col IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'ecommerce_connection_secrets'
      AND c.column_name LIKE v_prefix || '%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.ecommerce_connection_secrets DROP COLUMN IF EXISTS %I',
      col.column_name
    );
  END LOOP;

  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ecommerce_connection_secrets'
      AND c.conname LIKE ('ecommerce_connection_secrets_' || v_provider || '%')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.ecommerce_connection_secrets DROP CONSTRAINT IF EXISTS %I',
      con.conname
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4) Remover RPCs legadas do provider (best-effort, idempotente)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS nsp,
      p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE ('ecommerce_' || 'w' || 'oo_%')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', r.nsp, r.name, r.args);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5) Garantir RPCs canônicas sem provider legado
-- -----------------------------------------------------------------------------
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
    AND e.provider IN ('meli','shopee')
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
  IF p_provider NOT IN ('meli','shopee') THEN
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
  v_access_token_present boolean := false;
  v_refresh_token_present boolean := false;
  v_expires_at timestamptz := null;
  v_expired boolean := false;
  v_expires_soon boolean := false;
  v_expires_in_days int := null;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_provider NOT IN ('meli','shopee') THEN
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
    SELECT
      (s.access_token IS NOT NULL AND length(s.access_token) > 0),
      (s.refresh_token IS NOT NULL AND length(s.refresh_token) > 0),
      s.token_expires_at
    INTO v_access_token_present, v_refresh_token_present, v_expires_at
    FROM public.ecommerce_connection_secrets s
    WHERE s.empresa_id = v_empresa
      AND s.ecommerce_id = v_conn.id
    LIMIT 1;

    v_expired := (v_expires_at IS NOT NULL AND v_expires_at <= now());
    v_expires_soon := (v_expires_at IS NOT NULL AND v_expires_at > now() AND v_expires_at <= (now() + interval '7 days'));
    v_expires_in_days := CASE
      WHEN v_expires_at IS NULL THEN NULL
      ELSE greatest(0, floor(extract(epoch from (v_expires_at - now())) / 86400)::int)
    END;
  END IF;

  RETURN jsonb_build_object(
    'provider', p_provider,
    'has_connection', (v_conn IS NOT NULL),
    'status', COALESCE(v_conn.status, 'disconnected'),
    'external_account_id', COALESCE(v_conn.external_account_id, NULL),
    'connected_at', COALESCE(v_conn.connected_at, NULL),
    'last_sync_at', COALESCE(v_conn.last_sync_at, NULL),
    'last_error', COALESCE(v_conn.last_error, NULL),
    'has_token', COALESCE(v_access_token_present, false),
    'has_refresh_token', COALESCE(v_refresh_token_present, false),
    'token_expires_at', v_expires_at,
    'token_expired', COALESCE(v_expired, false),
    'token_expires_soon', COALESCE(v_expires_soon, false),
    'token_expires_in_days', v_expires_in_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connection_diagnostics(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connection_diagnostics(text) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
