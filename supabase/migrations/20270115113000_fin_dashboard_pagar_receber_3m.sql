-- =============================================================================
-- Financeiro (Dashboard): projeção de Contas a Pagar x Contas a Receber (próximos 3 meses)
-- - Série mensal a partir de hoje até (hoje + 3 meses)
-- - Considera valores em aberto (desconta valor_pago em status parcial/pendente)
-- - Ignora cancelados/pagos
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.financeiro_dashboard_pagar_receber_3m();

CREATE OR REPLACE FUNCTION public.financeiro_dashboard_pagar_receber_3m()
RETURNS TABLE (
  mes text,
  receber numeric,
  pagar numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_start_date date := current_date;
  v_end_date date := (current_date + interval '3 months')::date;
BEGIN
  -- Permissões: precisa conseguir ver contas a pagar e a receber
  PERFORM public.require_permission_for_current_user('contas_a_pagar', 'view');
  PERFORM public.require_permission_for_current_user('contas_a_receber', 'view');

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[FIN][DASH] empresa_id inválido' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', v_start_date)::date,
      date_trunc('month', v_end_date)::date,
      interval '1 month'
    )::date AS mes
  ),
  receber AS (
    SELECT
      date_trunc('month', c.data_vencimento)::date AS mes,
      SUM(GREATEST(coalesce(c.valor, 0) - coalesce(c.valor_pago, 0), 0)) AS total
    FROM public.contas_a_receber c
    WHERE c.empresa_id = v_empresa_id
      AND c.data_vencimento BETWEEN v_start_date AND v_end_date
      AND c.status IN ('pendente'::public.status_conta_receber, 'vencido'::public.status_conta_receber)
    GROUP BY 1
  ),
  pagar AS (
    SELECT
      date_trunc('month', cp.data_vencimento)::date AS mes,
      SUM(GREATEST(coalesce(cp.valor_total, 0) - coalesce(cp.valor_pago, 0), 0)) AS total
    FROM public.financeiro_contas_pagar cp
    WHERE cp.empresa_id = v_empresa_id
      AND cp.data_vencimento BETWEEN v_start_date AND v_end_date
      AND cp.status IN ('aberta', 'parcial')
    GROUP BY 1
  )
  SELECT
    to_char(m.mes, 'YYYY-MM') AS mes,
    COALESCE(r.total, 0) AS receber,
    COALESCE(p.total, 0) AS pagar
  FROM months m
  LEFT JOIN receber r ON r.mes = m.mes
  LEFT JOIN pagar p ON p.mes = m.mes
  ORDER BY m.mes;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_dashboard_pagar_receber_3m() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_dashboard_pagar_receber_3m() TO authenticated, service_role;

COMMIT;

