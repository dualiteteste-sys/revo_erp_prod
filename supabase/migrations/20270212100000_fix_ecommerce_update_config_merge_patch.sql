/*
  FIX-WOO-SEV: ecommerce_connections_update_config deve ser PATCH/merge (não overwrite total)

  Problema observado no fluxo Woo:
  - A URL da loja (config.store_url) é persistida por uma RPC específica (ecommerce_woo_set_store_url),
    mas o botão "Salvar" do assistente usa ecommerce_connections_update_config para salvar outros campos.
  - A versão anterior do ecommerce_connections_update_config fazia overwrite total do JSONB `config`,
    o que pode apagar `store_url` (ou outras chaves) quando o frontend envia payload parcial.

  Objetivo:
  - Transformar update_config em merge patch: manter config existente e aplicar somente as chaves fornecidas.
  - Hardening: se o payload tentar setar store_url vazia, ignorar (fail-safe) para evitar apagar URL por engano.

  Segurança:
  - Mantém guards: permission ecommerce:manage + tenant via current_empresa_id().
  - Não toca em segredos.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.ecommerce_connections_update_config(uuid, jsonb);

CREATE FUNCTION public.ecommerce_connections_update_config(p_id uuid, p_config jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_existing jsonb;
  v_patch jsonb;
  v_store_url text;
  v_next jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  SELECT e.config
    INTO v_existing
  FROM public.ecommerces e
  WHERE e.id = p_id
    AND e.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conexão não encontrada' USING errcode = 'P0002';
  END IF;

  v_patch := COALESCE(p_config, '{}'::jsonb);

  -- Fail-safe: se store_url veio vazia, não aplicar patch nessa chave (evita apagar URL existente por engano).
  IF jsonb_typeof(v_patch) = 'object' AND (v_patch ? 'store_url') THEN
    v_store_url := nullif(trim(coalesce(v_patch->>'store_url', '')), '');
    IF v_store_url IS NULL THEN
      v_patch := v_patch - 'store_url';
    END IF;
  END IF;

  v_next := COALESCE(v_existing, '{}'::jsonb) || v_patch;

  UPDATE public.ecommerces
  SET
    config = v_next,
    updated_at = now()
  WHERE id = p_id
    AND empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connections_update_config(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connections_update_config(uuid, jsonb) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

