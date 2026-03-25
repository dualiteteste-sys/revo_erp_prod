/*
  # Financeiro — Configuração Banco Inter (per-empresa)

  ## Descrição
  Tabela para armazenar credenciais de integração com Banco Inter API V3 (BolePix).
  Cada empresa configura: client_id, client_secret (encriptado), certificados mTLS (encriptados),
  chave PIX, ambiente (sandbox/producao).

  Credenciais sensíveis são encriptadas com AES-GCM via CERT_ENCRYPTION_KEY (Edge Function env).
  Tabela acessível apenas via service_role (Edge Functions) + RPCs com output mascarado para UI.

  ## Impact Summary
  - Segurança: RLS service_role only, credenciais encriptadas, output mascarado
  - Multi-tenant: empresa_id UNIQUE, current_empresa_id() em RPCs
  - Idempotente: IF NOT EXISTS em tudo
*/

-- =============================================
-- 1) Tabela: financeiro_inter_config
-- =============================================

CREATE TABLE IF NOT EXISTS public.financeiro_inter_config (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL UNIQUE,

  -- OAuth 2.0 credentials
  client_id               text,                    -- plain text (não é segredo crítico)
  client_secret_encrypted text,                    -- AES-GCM encrypted

  -- mTLS certificate (PEM strings, encrypted)
  cert_pem_encrypted      text,                    -- .crt file content, AES-GCM encrypted
  key_pem_encrypted       text,                    -- .key file content, AES-GCM encrypted

  -- PIX config
  pix_chave               text,                    -- chave PIX cadastrada (email, CPF, EVP, telefone)

  -- Webhook
  webhook_registered      boolean NOT NULL DEFAULT false,
  webhook_url             text,
  webhook_secret          text,                    -- token para validar callbacks

  -- Ambiente
  ambiente                text NOT NULL DEFAULT 'sandbox'
                          CHECK (ambiente IN ('sandbox', 'producao')),
  is_active               boolean NOT NULL DEFAULT false,

  -- Observabilidade
  last_token_at           timestamptz,
  last_error              text,

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  CONSTRAINT fin_inter_config_emp_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE
);

-- =============================================
-- 2) RLS — service_role only
-- =============================================

ALTER TABLE public.financeiro_inter_config ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy para authenticated/anon — apenas service_role bypassa RLS
-- Edge Functions usam supabaseAdmin (service_role) para acessar

-- Grants mínimos
REVOKE ALL ON public.financeiro_inter_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_inter_config TO service_role;

-- =============================================
-- 3) RPC: financeiro_inter_config_get (UI-safe, mascarado)
-- =============================================

DROP FUNCTION IF EXISTS public.financeiro_inter_config_get();

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

GRANT EXECUTE ON FUNCTION public.financeiro_inter_config_get() TO authenticated;

-- =============================================
-- 4) RPC: financeiro_inter_config_upsert (plain fields only — secrets via Edge Function)
-- =============================================

DROP FUNCTION IF EXISTS public.financeiro_inter_config_upsert(jsonb);

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

GRANT EXECUTE ON FUNCTION public.financeiro_inter_config_upsert(jsonb) TO authenticated;
