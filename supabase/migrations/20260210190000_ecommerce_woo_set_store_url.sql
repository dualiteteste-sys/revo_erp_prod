/*
  Fix (UX): WooCommerce store_url nao persistia de forma deterministica antes do "Testar conexao",
  levando a falsos "Falta URL" mesmo com o usuario preenchendo o campo no modal.

  Objetivo:
  - RPC dedicada para persistir somente `config.store_url` (sem gravar outras configs por acidente).
  - Normalizar de forma segura (trim + prefixo https:// quando ausente + remove query/hash + remove trailing slash).

  Segurança:
  - SECURITY DEFINER + require_permission_for_current_user('ecommerce','manage')
  - Valida empresa ativa e provider = 'woo'
*/

BEGIN;

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
    RAISE EXCEPTION 'Conexão não encontrada' USING errcode = 'P0002';
  END IF;
  IF v_provider <> 'woo' THEN
    RAISE EXCEPTION 'Conexão não é WooCommerce' USING errcode = '22023';
  END IF;

  v_raw := trim(coalesce(p_store_url, ''));
  IF v_raw = '' THEN
    RAISE EXCEPTION 'store_url_required' USING errcode = '22023';
  END IF;

  -- Se usuario nao informar protocolo, assumimos https:// (comportamento state-of-the-art).
  v_url := CASE
    WHEN v_raw ~* '^https?://' THEN v_raw
    ELSE 'https://' || v_raw
  END;

  -- Remove hash/query para manter base url deterministica.
  v_url := split_part(v_url, '#', 1);
  v_url := split_part(v_url, '?', 1);

  -- Remove barras finais redundantes (sem cortar subdiretorio).
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

  RETURN jsonb_build_object('store_url', v_url);
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_set_store_url(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_set_store_url(uuid, text) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

