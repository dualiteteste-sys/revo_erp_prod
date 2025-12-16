-- =============================================================================
-- PCP: flags de APS (lock/freeze) no Gantt simplificado
-- - Exibe no front o que está bloqueado por lock/manual ou por horizonte congelado
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pcp_gantt_ordens(date, date);
CREATE OR REPLACE FUNCTION public.pcp_gantt_ordens(
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL
)
RETURNS TABLE (
  ordem_id uuid,
  ordem_numero integer,
  produto_nome text,
  status text,
  quantidade_planejada numeric,
  data_prevista_inicio date,
  data_prevista_fim date,
  operacao_id uuid,
  operacao_sequencia integer,
  centro_trabalho_id uuid,
  centro_trabalho_nome text,
  permite_overlap boolean,
  status_operacao text,
  data_inicio date,
  data_fim date,
  quantidade_transferida numeric,
  transfer_ratio numeric,
  aps_locked boolean,
  aps_lock_reason text,
  aps_in_freeze boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dt_ini date := COALESCE(p_data_inicial, now()::date - 7);
  v_dt_fim date := COALESCE(p_data_final, now()::date + 14);
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  WITH cfg AS (
    SELECT centro_trabalho_id, COALESCE(freeze_dias, 0) AS freeze_dias
    FROM public.industria_ct_aps_config
    WHERE empresa_id = v_empresa_id
  )
  SELECT
    ord.id,
    ord.numero,
    prod.nome AS produto_nome,
    ord.status,
    ord.quantidade_planejada,
    ord.data_prevista_inicio,
    ord.data_prevista_fim,
    op.id,
    op.sequencia,
    op.centro_trabalho_id,
    op.centro_trabalho_nome,
    COALESCE(op.permite_overlap, false) AS permite_overlap,
    op.status,
    COALESCE(op.data_prevista_inicio, op.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) AS data_inicio,
    COALESCE(op.data_prevista_fim, op.data_fim_real::date, ord.data_prevista_fim, ord.data_prevista_inicio, now()::date) AS data_fim,
    COALESCE(op.quantidade_transferida, 0) AS quantidade_transferida,
    CASE
      WHEN COALESCE(op.quantidade_planejada, 0) = 0 THEN 0
      ELSE LEAST(op.quantidade_transferida / NULLIF(op.quantidade_planejada, 0), 1)
    END AS transfer_ratio,
    COALESCE(op.aps_locked, false) AS aps_locked,
    op.aps_lock_reason,
    (
      COALESCE(
        op.data_prevista_inicio,
        ord.data_prevista_inicio,
        ord.created_at::date,
        now()::date
      ) <= (now()::date + COALESCE(cfg.freeze_dias, 0))
    ) AS aps_in_freeze
  FROM public.industria_producao_ordens ord
  JOIN public.produtos prod ON prod.id = ord.produto_final_id
  JOIN public.industria_producao_operacoes op ON op.ordem_id = ord.id
  LEFT JOIN cfg ON cfg.centro_trabalho_id = op.centro_trabalho_id
  WHERE ord.empresa_id = v_empresa_id
    AND (
      COALESCE(op.data_prevista_inicio, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
      OR COALESCE(op.data_prevista_fim, ord.data_prevista_fim, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
      OR COALESCE(op.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
    )
  ORDER BY ord.data_prevista_inicio NULLS LAST, ord.numero, op.sequencia;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_gantt_ordens(date, date) TO authenticated, service_role;

COMMIT;

