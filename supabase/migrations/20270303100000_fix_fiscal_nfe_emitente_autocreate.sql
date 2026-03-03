-- ============================================================================
-- Fix: fiscal_nfe_emitente — auto-create row for empresas with CNPJ configured
-- ============================================================================
-- Root cause of EMITENTE_NOT_CONFIGURED:
--   Some empresas have valid CNPJ in `empresas` but no row in
--   `fiscal_nfe_emitente`, so the edge function returns 422.
--
-- Fix: INSERT a minimal row (cnpj + razao_social + address from empresas)
--   for any empresa that has a CNPJ but no emitente row yet.
--   Existing rows are NOT touched (ON CONFLICT DO NOTHING).
-- ============================================================================

INSERT INTO public.fiscal_nfe_emitente (
  empresa_id,
  razao_social,
  nome_fantasia,
  cnpj,
  crt,
  endereco_logradouro,
  endereco_numero,
  endereco_complemento,
  endereco_bairro,
  endereco_municipio,
  endereco_uf,
  endereco_cep
)
SELECT
  e.id                   AS empresa_id,
  e.nome_razao_social    AS razao_social,
  e.nome_fantasia        AS nome_fantasia,
  e.cnpj                 AS cnpj,
  1                      AS crt,  -- default: Simples Nacional
  e.endereco_logradouro,
  e.endereco_numero,
  e.endereco_complemento,
  e.endereco_bairro,
  e.endereco_cidade      AS endereco_municipio,
  e.endereco_uf,
  e.endereco_cep
FROM public.empresas e
WHERE e.cnpj IS NOT NULL
  AND e.cnpj <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.fiscal_nfe_emitente fe
    WHERE fe.empresa_id = e.id
  )
ON CONFLICT (empresa_id) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Fix: fiscal_nfe_emitente auto-created for empresas with CNPJ but no emitente row.';
END $$;
