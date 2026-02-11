/*
  FIX-WOO-SEV-01: Tornar erros de "conexão não encontrada" acionáveis e não-500

  Problema:
  - RPCs Woo levantavam errcode P0002 ("Conexão não encontrada"), o que vira 500 no PostgREST,
    gerando UX ruim e dificultando diagnóstico.
  - Esse cenário acontece principalmente quando o frontend tenta usar um `ecommerce_id` de outra empresa
    (troca de empresa em outra aba / estado stale), ou quando a conexão ainda não existe.

  Objetivo:
  - Trocar P0002 por 22023 (parâmetro inválido) com mensagem acionável.
  - Garantir que UPDATE realmente afetou 1 linha (fail-closed).

  Segurança:
  - Mantém SECURITY DEFINER + permission guard + tenant guard via current_empresa_id().
  - Não expõe segredos.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- Woo: persistir URL de loja (somente config.store_url)
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

  IF v_url !~* '^https?://[^\\s]+' THEN
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
-- Woo: persistir credenciais com DTO de confirmação
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

