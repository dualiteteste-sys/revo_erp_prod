/*
  # Fix: adicionar permission guard às RPCs financeiro_inter_config_*

  ## Descrição
  O verify_financeiro_rpc_first.sql exige que toda SECURITY DEFINER
  no domínio financeiro_* tenha:
    1. current_empresa_id()   ✓ já existia
    2. permission guard       ✗ faltava → corrigido aqui
    3. SET search_path         ✓ já existia

  Ambas RPCs agora requerem permissão 'tesouraria' (view para get, manage para upsert).

  ## Impact Summary
  - Segurança: reforça controle de acesso (permission guard)
  - Idempotente: CREATE OR REPLACE
*/

-- =============================================
-- 1) financeiro_inter_config_get — adiciona permission guard
-- =============================================

CREATE OR REPLACE FUNCTION public.financeiro_inter_config_get()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_row        public.financeiro_inter_config%ROWTYPE;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  PERFORM public.require_permission_for_current_user('tesouraria', 'view');

  SELECT * INTO v_row
  FROM public.financeiro_inter_config
  WHERE empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'configured', false,
      'ambiente', 'sandbox',
      'is_active', false
    );
  END IF;

  -- Retorna dados mascarados (nunca expor secrets ao client)
  RETURN jsonb_build_object(
    'configured',           true,
    'id',                   v_row.id,
    'ambiente',             v_row.ambiente,
    'is_active',            v_row.is_active,
    'client_id',            v_row.client_id,
    'has_client_secret',    (v_row.client_secret_encrypted IS NOT NULL AND v_row.client_secret_encrypted <> ''),
    'has_cert',             (v_row.cert_pem_encrypted IS NOT NULL AND v_row.cert_pem_encrypted <> ''),
    'has_key',              (v_row.key_pem_encrypted IS NOT NULL AND v_row.key_pem_encrypted <> ''),
    'pix_chave',            v_row.pix_chave,
    'webhook_registered',   v_row.webhook_registered,
    'webhook_url',          v_row.webhook_url,
    'last_token_at',        v_row.last_token_at,
    'last_error',           v_row.last_error,
    'updated_at',           v_row.updated_at
  );
END;
$$;

-- =============================================
-- 2) financeiro_inter_config_upsert — adiciona permission guard
-- =============================================

CREATE OR REPLACE FUNCTION public.financeiro_inter_config_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_id         uuid;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  PERFORM public.require_permission_for_current_user('tesouraria', 'manage');

  INSERT INTO public.financeiro_inter_config (
    empresa_id,
    client_id,
    pix_chave,
    ambiente,
    is_active,
    updated_at
  ) VALUES (
    v_empresa_id,
    p_payload->>'client_id',
    p_payload->>'pix_chave',
    COALESCE(p_payload->>'ambiente', 'sandbox'),
    COALESCE((p_payload->>'is_active')::boolean, false),
    now()
  )
  ON CONFLICT (empresa_id)
  DO UPDATE SET
    client_id  = COALESCE(p_payload->>'client_id', financeiro_inter_config.client_id),
    pix_chave  = COALESCE(p_payload->>'pix_chave', financeiro_inter_config.pix_chave),
    ambiente   = COALESCE(p_payload->>'ambiente', financeiro_inter_config.ambiente),
    is_active  = COALESCE((p_payload->>'is_active')::boolean, financeiro_inter_config.is_active),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'ok', true);
END;
$$;
