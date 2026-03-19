/*
  Fiscal 2026 — Part 4B: Dashboard KPIs RPC

  Returns aggregated KPI data for the fiscal dashboard:
  - Count of NF-e by status
  - Total value authorized in period
  - Pending items (rascunho/em_composicao/com_pendencias)
  - Recent rejections count
*/

CREATE OR REPLACE FUNCTION public.fiscal_dashboard_kpis(
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_start   date := COALESCE(p_data_inicio, date_trunc('month', CURRENT_DATE)::date);
  v_end     date := COALESCE(p_data_fim, CURRENT_DATE);
  v_result  jsonb;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'periodo_inicio', v_start,
    'periodo_fim', v_end,
    'totais_por_status', (
      SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, COUNT(*) AS cnt
        FROM public.fiscal_nfe_emissoes
        WHERE empresa_id = v_empresa
          AND created_at::date BETWEEN v_start AND v_end
        GROUP BY status
      ) sub
    ),
    'valor_autorizado', (
      SELECT COALESCE(SUM(total_nfe), 0)
      FROM public.fiscal_nfe_emissoes
      WHERE empresa_id = v_empresa
        AND status = 'autorizada'
        AND created_at::date BETWEEN v_start AND v_end
    ),
    'total_autorizadas', (
      SELECT COUNT(*)
      FROM public.fiscal_nfe_emissoes
      WHERE empresa_id = v_empresa
        AND status = 'autorizada'
        AND created_at::date BETWEEN v_start AND v_end
    ),
    'pendentes', (
      SELECT COUNT(*)
      FROM public.fiscal_nfe_emissoes
      WHERE empresa_id = v_empresa
        AND status IN ('rascunho', 'em_composicao', 'aguardando_validacao', 'com_pendencias', 'pronta')
    ),
    'rejeitadas_periodo', (
      SELECT COUNT(*)
      FROM public.fiscal_nfe_emissoes
      WHERE empresa_id = v_empresa
        AND status = 'rejeitada'
        AND created_at::date BETWEEN v_start AND v_end
    ),
    'erros_periodo', (
      SELECT COUNT(*)
      FROM public.fiscal_nfe_emissoes
      WHERE empresa_id = v_empresa
        AND status = 'erro'
        AND created_at::date BETWEEN v_start AND v_end
    ),
    'regras_fiscais_ativas', (
      SELECT COUNT(*)
      FROM public.fiscal_regras
      WHERE empresa_id = v_empresa
        AND ativo = true
    ),
    'ibs_cbs_enabled', (
      SELECT COALESCE(fiscal_ibs_cbs_enabled, false)
      FROM public.empresa_feature_flags
      WHERE empresa_id = v_empresa
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_dashboard_kpis(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_dashboard_kpis(date, date) TO authenticated, service_role;


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
