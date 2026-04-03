-- Super Cadastro: centralizar identidade da empresa na tabela `empresas`
-- `empresas` passa a ser source of truth para TODA identidade (incluindo dados fiscais: IE, IM, CNAE, CRT, IBGE).
-- `fiscal_nfe_emitente` mantém apenas config fiscal (certificado A1, NFC-e, Focus NFe).
-- Colunas de identidade em fiscal_nfe_emitente são preservadas (synced via RPC), motor NF-e não muda.

BEGIN;

-- 1. Adicionar colunas que faltam em empresas
--    inscr_estadual e inscr_municipal foram removidas em align_dev_schema (20260227030000); re-adicionamos aqui.
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS inscr_estadual text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS inscr_municipal text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cnae text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS crt integer;  -- 1=Simples Nacional, 2=Excesso sublimite, 3=Regime Normal
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS endereco_municipio_codigo text;  -- IBGE 7 dígitos

-- 2. Backfill: copiar dados de fiscal_nfe_emitente → empresas onde empresas está NULL
--    COALESCE garante que nunca sobrescrevemos dados já preenchidos em empresas.
UPDATE public.empresas e
SET
  inscr_estadual            = COALESCE(e.inscr_estadual, fe.ie),
  inscr_municipal           = COALESCE(e.inscr_municipal, fe.im),
  cnae                      = COALESCE(e.cnae, fe.cnae),
  crt                       = COALESCE(e.crt, fe.crt),
  endereco_municipio_codigo = COALESCE(e.endereco_municipio_codigo, fe.endereco_municipio_codigo),
  endereco_logradouro       = COALESCE(e.endereco_logradouro, fe.endereco_logradouro),
  endereco_numero           = COALESCE(e.endereco_numero, fe.endereco_numero),
  endereco_complemento      = COALESCE(e.endereco_complemento, fe.endereco_complemento),
  endereco_bairro           = COALESCE(e.endereco_bairro, fe.endereco_bairro),
  endereco_cidade           = COALESCE(e.endereco_cidade, fe.endereco_municipio),
  endereco_uf               = COALESCE(e.endereco_uf, fe.endereco_uf),
  endereco_cep              = COALESCE(e.endereco_cep, fe.endereco_cep),
  telefone                  = COALESCE(e.telefone, fe.telefone),
  email                     = COALESCE(e.email, fe.email),
  updated_at                = now()
FROM public.fiscal_nfe_emitente fe
WHERE fe.empresa_id = e.id;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
