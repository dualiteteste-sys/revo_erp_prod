-- =============================================
-- Migration: fix_focusnfe_status_field_names
-- Fix field name mismatch between RPC output and frontend TypeScript type.
-- RPC was returning: registrada, registrada_em, ultimo_erro, has_cert, cert_validade, cert_cnpj
-- Frontend expects: focusnfe_registrada, focusnfe_registrada_em, focusnfe_ultimo_erro, has_cert, certificado_validade, certificado_cnpj
-- =============================================

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
      'certificado_cnpj', null
    );
  END IF;

  RETURN jsonb_build_object(
    'focusnfe_registrada', COALESCE(v_row.focusnfe_registrada, false),
    'focusnfe_registrada_em', v_row.focusnfe_registrada_em,
    'focusnfe_ultimo_erro', v_row.focusnfe_ultimo_erro,
    'has_cert', v_row.certificado_storage_path IS NOT NULL,
    'certificado_validade', v_row.certificado_validade,
    'certificado_cnpj', v_row.certificado_cnpj
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emitente_focusnfe_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emitente_focusnfe_status()
  TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
