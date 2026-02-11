/*
  FIX-WOO-01: Persistencia de credenciais Woo com confirmacao explicita (backend source-of-truth)

  Problema observado:
  - UI pode limpar campos e/ou mostrar badges sem confirmacao do backend.
  - Ambientes com drift podem nao retornar `has_consumer_key/has_consumer_secret` no diagnostics,
    gerando "faltam credenciais" mesmo apos salvar.

  Objetivo:
  - Introduzir RPC v2 que grava CK/CS e retorna um DTO seguro confirmando persistencia:
    has_consumer_key, has_consumer_secret, connection_status, last_verified_at, error_message.
  - Ao salvar/alterar credenciais, resetar o estado de verificacao real para `pending`.

  Seguranca:
  - Nunca retorna CK/CS.
  - SECURITY DEFINER + permission guard + tenant guard via current_empresa_id().
*/

BEGIN;

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
    RAISE EXCEPTION 'Conexão não encontrada' USING errcode = 'P0002';
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

  SELECT
    (s.woo_consumer_key IS NOT NULL AND length(s.woo_consumer_key) > 0),
    (s.woo_consumer_secret IS NOT NULL AND length(s.woo_consumer_secret) > 0)
  INTO v_has_ck, v_has_cs
  FROM public.ecommerce_connection_secrets s
  WHERE s.ecommerce_id = p_ecommerce_id
    AND s.empresa_id = v_empresa
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

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

