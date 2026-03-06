-- NFE-STA-01/02/03: rejection catalog, contingency UX, fiscal reports
-- Adds rejection_code + reprocess_count columns and extends fiscal_nfe_emissoes_list
-- with date filter params (p_data_inicio, p_data_fim) for fiscal reporting.

BEGIN;

-- ============================================================
-- 1. New columns on fiscal_nfe_emissoes (NFE-STA-01)
-- ============================================================
ALTER TABLE public.fiscal_nfe_emissoes
  ADD COLUMN IF NOT EXISTS rejection_code TEXT,
  ADD COLUMN IF NOT EXISTS reprocess_count INT NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Update fiscal_nfe_emissoes_list with date filters + new cols
-- ============================================================
DROP FUNCTION IF EXISTS public.fiscal_nfe_emissoes_list(text, text, int) CASCADE;

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissoes_list(
  p_status       text DEFAULT NULL,
  p_q            text DEFAULT NULL,
  p_limit        int  DEFAULT 200,
  p_data_inicio  date DEFAULT NULL,
  p_data_fim     date DEFAULT NULL
)
RETURNS TABLE(
  id                     uuid,
  status                 text,
  numero                 int,
  serie                  int,
  chave_acesso           text,
  destinatario_pessoa_id uuid,
  destinatario_nome      text,
  ambiente               text,
  natureza_operacao      text,
  valor_total            numeric,
  total_produtos         numeric,
  total_descontos        numeric,
  total_frete            numeric,
  total_impostos         numeric,
  total_nfe              numeric,
  payload                jsonb,
  last_error             text,
  rejection_code         text,
  reprocess_count        int,
  created_at             timestamptz,
  updated_at             timestamptz,
  pedido_origem_id       uuid,
  danfe_url              text,
  xml_url                text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit   int  := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  v_status  text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_q       text := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.status,
    e.numero,
    e.serie,
    e.chave_acesso,
    e.destinatario_pessoa_id,
    p.nome AS destinatario_nome,
    e.ambiente,
    e.natureza_operacao,
    e.valor_total,
    e.total_produtos,
    e.total_descontos,
    e.total_frete,
    e.total_impostos,
    e.total_nfe,
    e.payload,
    e.last_error,
    e.rejection_code,
    e.reprocess_count,
    e.created_at,
    e.updated_at,
    e.pedido_origem_id,
    nio.danfe_url,
    nio.xml_url
  FROM public.fiscal_nfe_emissoes e
  LEFT JOIN public.pessoas p ON p.id = e.destinatario_pessoa_id
  LEFT JOIN public.fiscal_nfe_nfeio_emissoes nio ON nio.emissao_id = e.id
  WHERE e.empresa_id = v_empresa
    AND (v_status IS NULL OR e.status = v_status)
    AND (
      v_q IS NULL
      OR e.chave_acesso ILIKE '%' || v_q || '%'
      OR p.nome ILIKE '%' || v_q || '%'
      OR e.status ILIKE '%' || v_q || '%'
      OR e.numero::text ILIKE '%' || v_q || '%'
      OR e.serie::text ILIKE '%' || v_q || '%'
    )
    AND (p_data_inicio IS NULL OR e.created_at::date >= p_data_inicio)
    AND (p_data_fim   IS NULL OR e.created_at::date <= p_data_fim)
  ORDER BY e.updated_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissoes_list(text, text, int, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissoes_list(text, text, int, date, date) TO authenticated, service_role;

COMMIT;
