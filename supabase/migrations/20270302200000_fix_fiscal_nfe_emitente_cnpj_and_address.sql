-- ============================================================================
-- Fix: fiscal_nfe_emitente — sync CNPJ and address from empresas
-- ============================================================================
-- Root cause: fiscal_nfe_emitente stores copies of fields that already exist
-- in empresas. These copies can diverge (e.g. CNPJ typo, address never filled).
--
-- Fix 1 — CNPJ: for any row where fiscal_nfe_emitente.cnpj differs from
--   empresas.cnpj, update to use the authoritative value.
--   (In prod, empresa a7980903 had cnpj = '32290621000107' vs correct '32290620000107')
--
-- Fix 2 — Address: populate null address fields from empresas for all empresas
--   that configured fiscal_nfe_emitente but never filled in the address
--   (the UI does not expose address fields on the NF-e config screen).
--
-- These changes are idempotent: rows already correct are not touched.
-- ============================================================================

-- 1. Sync CNPJ from empresas (source of truth)
UPDATE public.fiscal_nfe_emitente fe
SET
  cnpj       = e.cnpj,
  updated_at = now()
FROM public.empresas e
WHERE fe.empresa_id = e.id
  AND fe.cnpj IS DISTINCT FROM e.cnpj;

-- 2. Populate null address fields from empresas
--    COALESCE keeps any value already in fiscal_nfe_emitente (custom override),
--    only filling when the field is NULL.
UPDATE public.fiscal_nfe_emitente fe
SET
  endereco_logradouro = COALESCE(fe.endereco_logradouro, e.endereco_logradouro),
  endereco_numero     = COALESCE(fe.endereco_numero,     e.endereco_numero),
  endereco_complemento= COALESCE(fe.endereco_complemento,e.endereco_complemento),
  endereco_bairro     = COALESCE(fe.endereco_bairro,     e.endereco_bairro),
  endereco_municipio  = COALESCE(fe.endereco_municipio,  e.endereco_cidade),
  endereco_uf         = COALESCE(fe.endereco_uf,         e.endereco_uf),
  endereco_cep        = COALESCE(fe.endereco_cep,        e.endereco_cep),
  updated_at          = now()
FROM public.empresas e
WHERE fe.empresa_id = e.id
  AND (
    fe.endereco_logradouro IS NULL
    OR fe.endereco_uf      IS NULL
    OR fe.endereco_municipio IS NULL
  );

DO $$
BEGIN
  RAISE NOTICE 'Fix: fiscal_nfe_emitente CNPJ + address synced from empresas.';
END $$;
