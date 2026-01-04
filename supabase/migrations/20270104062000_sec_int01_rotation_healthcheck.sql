/*
  SEC-INT-01 (P0): Rotação de tokens (marketplaces) + health check

  Problema
  - Integrações OAuth (ex.: Mercado Livre, Shopee) dependem de tokens que expiram/precisam de refresh.
  - Sem um "health check" objetivo, o time só descobre quando o usuário reclama.

  O que este migration faz (idempotente)
  - Estende `public.ecommerce_connection_diagnostics(p_provider)` para retornar:
    - `token_expires_soon` (true quando expira em <= 7 dias)
    - `token_expires_in_days` (inteiro, quando aplicável)

  Impacto
  - Nenhuma mudança de schema.
  - Apenas adiciona campos no JSON de diagnóstico (compatível com versões antigas do front).

  Reversibilidade
  - Reverter para a versão anterior da função (migration anterior) remove os campos extras.
*/

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
    SELECT true,
           (s.access_token IS NOT NULL AND length(s.access_token) > 0),
           (s.refresh_token IS NOT NULL AND length(s.refresh_token) > 0),
           s.token_expires_at
    INTO v_has_secret, v_access_token_present, v_refresh_token_present, v_expires_at
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
    'status', coalesce(v_conn.status, 'disconnected'),
    'external_account_id', coalesce(v_conn.external_account_id, null),
    'connected_at', coalesce(v_conn.connected_at, null),
    'last_sync_at', coalesce(v_conn.last_sync_at, null),
    'last_error', coalesce(v_conn.last_error, null),
    'has_token', coalesce(v_access_token_present, false),
    'has_refresh_token', coalesce(v_refresh_token_present, false),
    'token_expires_at', v_expires_at,
    'token_expired', coalesce(v_expired, false),
    'token_expires_soon', coalesce(v_expires_soon, false),
    'token_expires_in_days', v_expires_in_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connection_diagnostics(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connection_diagnostics(text) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

