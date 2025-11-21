-- =============================================================================
-- RPC: get_contas_a_receber_summary
-- Desc: Retorna um resumo dos totais de contas a receber para a empresa ativa.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_contas_a_receber_summary()
RETURNS TABLE (
  total_pendente numeric,
  total_pago_mes numeric,
  total_vencido numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_start_of_month date := date_trunc('month', now());
  v_end_of_month date := date_trunc('month', now()) + interval '1 month' - interval '1 day';
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) as total_pendente,
    COALESCE(SUM(CASE WHEN status = 'pago' AND data_pagamento BETWEEN v_start_of_month AND v_end_of_month THEN valor_pago ELSE 0 END), 0) as total_pago_mes,
    COALESCE(SUM(CASE WHEN status = 'vencido' THEN valor ELSE 0 END), 0) as total_vencido
  FROM public.contas_a_receber
  WHERE empresa_id = v_empresa_id;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.get_contas_a_receber_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contas_a_receber_summary() TO authenticated;
