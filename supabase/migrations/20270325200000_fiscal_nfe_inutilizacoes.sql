/*
  # Fiscal: Tabela de Inutilização de Numeração NF-e

  ## Descrição
  Cria tabela fiscal_nfe_inutilizacoes para armazenar o histórico de
  inutilizações de numeração junto à SEFAZ, e RPC de listagem.

  ## Impact Summary
  - Idempotente: IF NOT EXISTS + CREATE OR REPLACE
  - Sem breaking changes: nova tabela + nova função
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Tabela de inutilizações
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_nfe_inutilizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ambiente text NOT NULL DEFAULT 'homologacao',
  serie int NOT NULL,
  numero_inicial int NOT NULL,
  numero_final int NOT NULL,
  justificativa text NOT NULL,
  status text NOT NULL DEFAULT 'processando',
  status_sefaz text,
  mensagem_sefaz text,
  protocolo text,
  xml_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_nfe_inutilizacoes ENABLE ROW LEVEL SECURITY;

-- RLS: select por empresa
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fiscal_nfe_inutilizacoes'
      AND policyname = 'fiscal_nfe_inutilizacoes_select'
  ) THEN
    CREATE POLICY fiscal_nfe_inutilizacoes_select
      ON public.fiscal_nfe_inutilizacoes
      FOR SELECT
      TO authenticated
      USING (empresa_id = public.current_empresa_id());
  END IF;
END $$;

-- RLS: service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fiscal_nfe_inutilizacoes'
      AND policyname = 'fiscal_nfe_inutilizacoes_service_role'
  ) THEN
    CREATE POLICY fiscal_nfe_inutilizacoes_service_role
      ON public.fiscal_nfe_inutilizacoes
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT ON TABLE public.fiscal_nfe_inutilizacoes TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.fiscal_nfe_inutilizacoes TO service_role;

CREATE INDEX IF NOT EXISTS idx_fiscal_nfe_inutilizacoes_empresa
  ON public.fiscal_nfe_inutilizacoes (empresa_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. RPC: listagem de inutilizações
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fiscal_nfe_inutilizacoes_list(
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id              uuid,
  ambiente        text,
  serie           int,
  numero_inicial  int,
  numero_final    int,
  justificativa   text,
  status          text,
  status_sefaz    text,
  mensagem_sefaz  text,
  protocolo       text,
  xml_url         text,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('fiscal', 'view');

  RETURN QUERY
  SELECT
    i.id,
    i.ambiente,
    i.serie,
    i.numero_inicial,
    i.numero_final,
    i.justificativa,
    i.status,
    i.status_sefaz,
    i.mensagem_sefaz,
    i.protocolo,
    i.xml_url,
    i.created_at
  FROM public.fiscal_nfe_inutilizacoes i
  WHERE i.empresa_id = v_empresa
  ORDER BY i.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_inutilizacoes_list(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_inutilizacoes_list(int, int)
  TO authenticated, service_role;
