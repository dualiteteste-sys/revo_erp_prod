/*
  Fix: Natureza RET_COBR deve usar ICMS CST 90 (Outras), não 00 (Tributada integralmente).
  Operações de Retorno e Cobrança (CFOP 5124) usam CST 90 com ICMS zerado.
  Ref: DANFE NF 28.359 MAAC → METALTORK.
*/

-- 1. Atualizar registros existentes
UPDATE public.fiscal_naturezas_operacao
SET icms_cst = '90',
    icms_aliquota = 0,
    icms_reducao_base = 0
WHERE codigo = 'RET_COBR'
  AND is_system = true
  AND icms_cst = '00';

-- 2. Atualizar seed_defaults para novas empresas
DROP FUNCTION IF EXISTS public.fiscal_naturezas_operacao_seed_defaults(uuid);
CREATE OR REPLACE FUNCTION public.fiscal_naturezas_operacao_seed_defaults(
  p_empresa_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'VENDA', 'Venda de mercadoria', '5102', '6102', '00', '102', '99', '99', '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'VENDA_PROD', 'Venda de produção do estabelecimento', '5101', '6101', '00', '102', '99', '99', '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'DEVOL_COMPRA', 'Devolução de compra', '5202', '6202', '00', '102', '99', '99', '4', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'REM_INDUST', 'Remessa para industrialização', '5901', '6901', '00', '300', '99', '99', false, '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'RET_INDUST', 'Retorno de industrialização', '5902', '6902', '00', '300', '99', '99', false, '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'REM_BENEF', 'Remessa para beneficiamento', '5924', '6924', '00', '300', '99', '99', false, '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  -- Retorno e cobrança: CST 90 (Outras) — ICMS zerado
  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, cfop_secundario_dentro_uf, cfop_secundario_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'RET_COBR', 'Retorno e cobrança', '5124', '6124', '5902', '6902', '90', '900', '99', '99', '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  INSERT INTO public.fiscal_naturezas_operacao (empresa_id, codigo, descricao, cfop_dentro_uf, cfop_fora_uf, icms_cst, icms_csosn, pis_cst, cofins_cst, gera_financeiro, finalidade_emissao, is_system)
  VALUES (p_empresa_id, 'TRANSFER', 'Transferência', '5152', '6152', '00', '300', '99', '99', false, '1', true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_naturezas_operacao_seed_defaults(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_naturezas_operacao_seed_defaults(uuid) TO authenticated, service_role;

-- Notify PostgREST schema reload
SELECT pg_notify('pgrst','reload schema');
