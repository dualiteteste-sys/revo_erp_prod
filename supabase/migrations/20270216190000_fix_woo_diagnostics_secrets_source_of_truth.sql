/*
  WooCommerce — Fix definitivo: ecommerce_connection_diagnostics como fonte de verdade

  Problema observado em produção/local:
  - Salvar CK/CS funciona (RPC ecommerce_woo_set_secrets_v2 persiste no DB),
    mas a UI chama ecommerce_connection_diagnostics e recebe has_consumer_key/secret=false,
    revertendo os sinalizadores para "não armazenada".

  Objetivo:
  - has_consumer_key/has_consumer_secret devem refletir EXCLUSIVAMENTE o estado do DB (secrets salvos),
    independente de falhas no teste de conexão.
  - Separar claramente "secrets stored?" de "connection test status".
  - Robustecer seleção do "registro preferido" quando houver múltiplas conexões legacy.

  Segurança:
  - Nunca retornar CK/CS (apenas booleanos e metadados não sensíveis).
  - SECURITY DEFINER (padrão do repo) + permission guard.
*/

DROP FUNCTION IF EXISTS public.ecommerce_connection_diagnostics(text);

CREATE FUNCTION public.ecommerce_connection_diagnostics(p_provider text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_conn record;

  -- OAuth tokens (provedores não-Woo)
  v_access_token_present boolean := false;
  v_refresh_token_present boolean := false;
  v_expires_at timestamptz := null;
  v_expired boolean := false;

  -- Woo secrets + verificação
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

  IF v_provider NOT IN ('meli','shopee','woo') THEN
    RAISE EXCEPTION 'provider inválido' USING errcode = '22023';
  END IF;

  /*
    Seleção "preferida" (legacy):
    - Para Woo: preferir registro com CK+CS presentes; depois por status; depois por recência.
    - Para demais: preservar comportamento baseado em access_token/refresh_token.
    Observação: o join com secrets é a fonte de verdade dos booleans e evita mismatch
    quando existem múltiplas linhas legacy na tabela ecommerces.
  */
  IF v_provider = 'woo' THEN
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
      e.updated_at,
      (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0) AS woo_ck_present,
      (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0) AS woo_cs_present,
      s.woo_last_verified_at AS woo_verified_at,
      s.woo_connection_status AS woo_conn_status,
      s.woo_connection_error AS woo_conn_error
    INTO v_conn
    FROM public.ecommerces e
    LEFT JOIN public.ecommerce_connection_secrets s
      ON s.empresa_id = v_empresa
     AND s.ecommerce_id = e.id
    WHERE e.empresa_id = v_empresa
      AND e.provider = v_provider
    ORDER BY
      CASE
        WHEN (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0)
         AND (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0)
         AND e.status = 'connected'
        THEN 0
        WHEN (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0)
         AND (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0)
        THEN 1
        WHEN e.status = 'connected' THEN 2
        WHEN e.status = 'pending' THEN 3
        WHEN e.status = 'error' THEN 4
        ELSE 5
      END,
      COALESCE(s.updated_at, e.updated_at) DESC NULLS LAST,
      e.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_conn IS NOT NULL THEN
      v_woo_ck_present := COALESCE((v_conn.woo_ck_present)::boolean, false);
      v_woo_cs_present := COALESCE((v_conn.woo_cs_present)::boolean, false);
      v_woo_verified_at := v_conn.woo_verified_at;
      v_woo_conn_status := v_conn.woo_conn_status;
      v_woo_conn_error := v_conn.woo_conn_error;
    END IF;
  ELSE
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
      e.updated_at,
      (s.access_token IS NOT NULL AND length(s.access_token) > 0) AS access_token_present,
      (s.refresh_token IS NOT NULL AND length(s.refresh_token) > 0) AS refresh_token_present,
      s.token_expires_at AS token_expires_at
    INTO v_conn
    FROM public.ecommerces e
    LEFT JOIN public.ecommerce_connection_secrets s
      ON s.empresa_id = v_empresa
     AND s.ecommerce_id = e.id
    WHERE e.empresa_id = v_empresa
      AND e.provider = v_provider
    ORDER BY
      CASE
        WHEN (s.access_token IS NOT NULL AND length(s.access_token) > 0) AND e.status = 'connected' THEN 0
        WHEN (s.access_token IS NOT NULL AND length(s.access_token) > 0) THEN 1
        WHEN e.status = 'connected' THEN 2
        WHEN e.status = 'pending' THEN 3
        WHEN e.status = 'error' THEN 4
        ELSE 5
      END,
      COALESCE(s.updated_at, e.updated_at) DESC NULLS LAST,
      e.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_conn IS NOT NULL THEN
      v_access_token_present := COALESCE((v_conn.access_token_present)::boolean, false);
      v_refresh_token_present := COALESCE((v_conn.refresh_token_present)::boolean, false);
      v_expires_at := v_conn.token_expires_at;
      v_expired := (v_expires_at IS NOT NULL AND v_expires_at <= now());
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'provider', v_provider,
    'has_connection', (v_conn IS NOT NULL),
    'status', COALESCE(v_conn.status, 'disconnected'),

    -- "connection_status" é a visão de teste/saúde de conexão (pode ser "error" mesmo com secrets salvos)
    'connection_status',
      CASE
        WHEN v_provider = 'woo' THEN
          CASE
            WHEN v_conn IS NULL THEN 'pending'
            WHEN COALESCE(v_woo_ck_present, false) = false OR COALESCE(v_woo_cs_present, false) = false THEN 'pending'
            WHEN COALESCE(v_woo_conn_status, '') = 'connected' THEN 'connected'
            WHEN COALESCE(v_woo_conn_status, '') = 'error' THEN 'error'
            ELSE 'pending'
          END
        ELSE COALESCE(v_conn.status, 'disconnected')
      END,
    'error_message', CASE WHEN v_provider = 'woo' THEN v_woo_conn_error ELSE COALESCE(v_conn.last_error, NULL) END,
    'last_verified_at', CASE WHEN v_provider = 'woo' THEN v_woo_verified_at ELSE NULL END,

    -- Secrets stored? (source of truth: DB)
    'has_consumer_key', CASE WHEN v_provider = 'woo' THEN COALESCE(v_woo_ck_present, false) ELSE false END,
    'has_consumer_secret', CASE WHEN v_provider = 'woo' THEN COALESCE(v_woo_cs_present, false) ELSE false END,

    -- Compat: "has_token" mantém semântica anterior (Woo: CK+CS; outros: access_token)
    'has_token',
      CASE
        WHEN v_provider = 'woo' THEN COALESCE(v_woo_ck_present AND v_woo_cs_present, false)
        ELSE COALESCE(v_access_token_present, false)
      END,
    'has_refresh_token', CASE WHEN v_provider = 'woo' THEN false ELSE COALESCE(v_refresh_token_present, false) END,
    'token_expires_at', CASE WHEN v_provider = 'woo' THEN NULL ELSE v_expires_at END,
    'token_expired', CASE WHEN v_provider = 'woo' THEN false ELSE COALESCE(v_expired, false) END,

    -- Campos auxiliares (não sensíveis) para UI/operabilidade
    'external_account_id', COALESCE(v_conn.external_account_id, NULL),
    'connected_at', COALESCE(v_conn.connected_at, NULL),
    'last_sync_at', COALESCE(v_conn.last_sync_at, NULL),
    'last_error', COALESCE(v_conn.last_error, NULL)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ecommerce_connection_diagnostics(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connection_diagnostics(text) TO authenticated, service_role;

