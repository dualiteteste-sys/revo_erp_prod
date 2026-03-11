-- Add Focus NFe registration tracking to fiscal_nfe_emitente
BEGIN;

ALTER TABLE public.fiscal_nfe_emitente
  ADD COLUMN IF NOT EXISTS focusnfe_registrada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS focusnfe_registrada_em timestamptz,
  ADD COLUMN IF NOT EXISTS focusnfe_ultimo_erro text;

-- Add focusnfe_versao to sync table for MDe API pagination
ALTER TABLE public.fiscal_nfe_destinadas_sync
  ADD COLUMN IF NOT EXISTS focusnfe_versao bigint DEFAULT 0;

-- Add cancellation columns to NF-e emissoes
ALTER TABLE public.fiscal_nfe_emissoes
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_justificativa text,
  ADD COLUMN IF NOT EXISTS cancelamento_protocolo text;

-- RPC: check Focus NFe registration status
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emitente_focusnfe_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eid uuid := public.current_empresa_id();
  v_row record;
BEGIN
  IF v_eid IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_NOT_SET';
  END IF;

  SELECT * INTO v_row
  FROM public.fiscal_nfe_emitente
  WHERE empresa_id = v_eid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'registrada', false,
      'registrada_em', null,
      'ultimo_erro', null,
      'has_cert', false
    );
  END IF;

  RETURN jsonb_build_object(
    'registrada', COALESCE(v_row.focusnfe_registrada, false),
    'registrada_em', v_row.focusnfe_registrada_em,
    'ultimo_erro', v_row.focusnfe_ultimo_erro,
    'has_cert', v_row.certificado_storage_path IS NOT NULL,
    'cert_validade', v_row.certificado_validade,
    'cert_cnpj', v_row.certificado_cnpj
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_focusnfe_status() TO authenticated;

COMMIT;
