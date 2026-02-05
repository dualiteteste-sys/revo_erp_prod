/*
  Fix (PROD): rpc:ecommerce_woo_set_secrets falhando com:
    column "provider" of relation "ecommerce_connection_secrets" does not exist (42703)

  Contexto:
  - A tabela `public.ecommerce_connection_secrets` (base) não possui coluna `provider`.
  - A RPC `public.ecommerce_woo_set_secrets(...)` foi criada referenciando `provider`, causando erro em runtime.

  Solução:
  - Recriar a RPC removendo a dependência de `ecommerce_connection_secrets.provider`
    e usando UPSERT por `ecommerce_id` (único) para manter 1 linha de segredos por conexão.

  Segurança:
  - Mantém `SECURITY DEFINER` + `require_permission_for_current_user('ecommerce','manage')`.
  - Valida que a conexão existe na empresa ativa e que `provider = 'woo'`.
*/

BEGIN;

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
    woo_consumer_key,
    woo_consumer_secret
  )
  VALUES (
    v_empresa,
    p_ecommerce_id,
    nullif(trim(coalesce(p_consumer_key,'')), ''),
    nullif(trim(coalesce(p_consumer_secret,'')), '')
  )
  ON CONFLICT (ecommerce_id)
  DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    woo_consumer_key = EXCLUDED.woo_consumer_key,
    woo_consumer_secret = EXCLUDED.woo_consumer_secret,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_woo_set_secrets(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_woo_set_secrets(uuid, text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

