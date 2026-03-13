-- =============================================
-- Migration: fiscal_focusnfe_per_company_tokens
-- Add per-company Focus NFe API tokens.
-- When registering via reseller API, Focus NFe returns unique
-- production/homologation tokens per company. We store them to
-- use in per-company API calls (MDe, NF-e emission, etc.).
-- =============================================

ALTER TABLE public.fiscal_nfe_emitente
  ADD COLUMN IF NOT EXISTS focusnfe_token_producao text,
  ADD COLUMN IF NOT EXISTS focusnfe_token_homologacao text;

COMMENT ON COLUMN public.fiscal_nfe_emitente.focusnfe_token_producao
  IS 'Token de produção da empresa na Focus NFe (retornado pela API de revenda ao cadastrar).';

COMMENT ON COLUMN public.fiscal_nfe_emitente.focusnfe_token_homologacao
  IS 'Token de homologação da empresa na Focus NFe (retornado pela API de revenda ao cadastrar).';

-- Update the status RPC to include token availability info
DROP FUNCTION IF EXISTS public.fiscal_nfe_emitente_focusnfe_status();

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
      'focusnfe_registrada', false,
      'focusnfe_registrada_em', null,
      'focusnfe_ultimo_erro', null,
      'has_cert', false,
      'certificado_validade', null,
      'certificado_cnpj', null,
      'has_company_tokens', false
    );
  END IF;

  RETURN jsonb_build_object(
    'focusnfe_registrada', COALESCE(v_row.focusnfe_registrada, false),
    'focusnfe_registrada_em', v_row.focusnfe_registrada_em,
    'focusnfe_ultimo_erro', v_row.focusnfe_ultimo_erro,
    'has_cert', v_row.certificado_storage_path IS NOT NULL,
    'certificado_validade', v_row.certificado_validade,
    'certificado_cnpj', v_row.certificado_cnpj,
    'has_company_tokens', (v_row.focusnfe_token_producao IS NOT NULL OR v_row.focusnfe_token_homologacao IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_focusnfe_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_focusnfe_status()
  TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
