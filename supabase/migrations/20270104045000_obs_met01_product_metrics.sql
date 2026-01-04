/*
  OBS-MET-01: Métricas de produto (mínimo pragmático)

  Problema:
  - Sem métricas objetivas (latência/erro/tempo de "primeiro valor"), o suporte vira "achismo".

  Solução:
  - Reaproveitar `public.app_logs` como repositório de métricas (eventos `metric.*`).
  - Criar permissão `metrics:view` e RPC `public.product_metrics_summary` para a UI (Dev → Saúde / suporte).

  Impacto:
  - Apenas leitura/agrupamento. Não altera schema de entidades de negócio.
  - Métricas são por empresa (multi-tenant) e obedecem RBAC.

  Reversibilidade:
  - Reverter removendo a permissão e a função. Eventos já registrados permanecem em `app_logs`.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Permissão `metrics:view`
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.permissions') IS NULL OR to_regclass('public.roles') IS NULL OR to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.permissions(module, action)
  VALUES ('metrics','view')
  ON CONFLICT (module, action) DO NOTHING;

  -- OWNER/ADMIN/OPS podem ver métricas
  INSERT INTO public.role_permissions(role_id, permission_id, allow)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permissions p ON p.module='metrics' AND p.action='view'
  WHERE r.slug IN ('OWNER','ADMIN','OPS')
  ON CONFLICT DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- RPC: summary simples (latência/erro/first-value) baseado em app_logs
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.product_metrics_summary(interval);
CREATE FUNCTION public.product_metrics_summary(p_window interval DEFAULT interval '24 hours')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_from timestamptz := now() - coalesce(p_window, interval '24 hours');
  v_rpc_count int := 0;
  v_rpc_error_count int := 0;
  v_rpc_error_rate numeric := 0;
  v_p50_ms int := 0;
  v_p95_ms int := 0;
  v_first_value_ms int := 0;
BEGIN
  -- Não expor para quem não tem permissão.
  PERFORM public.require_permission_for_current_user('metrics','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  -- Contagem e taxa de erro (event = metric.rpc)
  SELECT count(*)::int,
         sum(CASE WHEN (context->>'ok') = 'false' THEN 1 ELSE 0 END)::int
  INTO v_rpc_count, v_rpc_error_count
  FROM public.app_logs
  WHERE empresa_id = v_empresa
    AND created_at >= v_from
    AND event = 'metric.rpc';

  IF v_rpc_count > 0 THEN
    v_rpc_error_rate := round((v_rpc_error_count::numeric / v_rpc_count::numeric) * 100.0, 2);
  END IF;

  -- P50/P95 (ms) quando duration_ms está presente.
  SELECT
    COALESCE(round(percentile_cont(0.50) WITHIN GROUP (ORDER BY (context->>'duration_ms')::numeric))::int, 0),
    COALESCE(round(percentile_cont(0.95) WITHIN GROUP (ORDER BY (context->>'duration_ms')::numeric))::int, 0)
  INTO v_p50_ms, v_p95_ms
  FROM public.app_logs
  WHERE empresa_id = v_empresa
    AND created_at >= v_from
    AND event = 'metric.rpc'
    AND (context ? 'duration_ms');

  -- Primeiro valor (ms) — menor valor observado na janela
  SELECT COALESCE(min((context->>'value_ms')::int), 0)
  INTO v_first_value_ms
  FROM public.app_logs
  WHERE empresa_id = v_empresa
    AND created_at >= v_from
    AND event = 'metric.first_value'
    AND (context ? 'value_ms');

  RETURN jsonb_build_object(
    'from', v_from,
    'to', now(),
    'rpc', jsonb_build_object(
      'count', v_rpc_count,
      'error_count', v_rpc_error_count,
      'error_rate_pct', v_rpc_error_rate,
      'p50_ms', v_p50_ms,
      'p95_ms', v_p95_ms
    ),
    'first_value', jsonb_build_object(
      'min_ms', v_first_value_ms
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.product_metrics_summary(interval) FROM public;
GRANT EXECUTE ON FUNCTION public.product_metrics_summary(interval) TO authenticated, service_role;

COMMIT;

