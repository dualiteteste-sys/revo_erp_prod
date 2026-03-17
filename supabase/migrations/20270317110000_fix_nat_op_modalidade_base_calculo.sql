/*
  Fix: fiscal_nfe_calcular_impostos references v_nat.icms_modalidade_base_calculo
  but the column was never added to fiscal_naturezas_operacao.
  Default 3 = "Valor da operação" (modalidade padrão ICMS).
*/
ALTER TABLE public.fiscal_naturezas_operacao
  ADD COLUMN IF NOT EXISTS icms_modalidade_base_calculo int NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.fiscal_naturezas_operacao.icms_modalidade_base_calculo
  IS 'Modalidade base de cálculo ICMS: 0=Margem Valor Agregado, 1=Pauta, 2=Preço Tabelado Máx, 3=Valor da Operação';

SELECT pg_notify('pgrst','reload schema');
