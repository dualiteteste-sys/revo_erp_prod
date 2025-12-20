-- =============================================================================
-- PCP: Fix PL/pgSQL variable/column name ambiguity in RPCs
-- Error observed: column reference "centro_trabalho_id" is ambiguous
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- pcp_gantt_ordens: qualify centro_trabalho_id in cfg CTE (conflicts with OUT var)
-- -----------------------------------------------------------------------------
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
    SELECT c.centro_trabalho_id, COALESCE(c.freeze_dias, 0) AS freeze_dias
    FROM public.industria_ct_aps_config c
    WHERE c.empresa_id = v_empresa_id
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

-- -----------------------------------------------------------------------------
-- pcp_carga_capacidade: qualify centro_trabalho_id in calendario CTE (OUT var)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pcp_carga_capacidade(date, date);
CREATE OR REPLACE FUNCTION public.pcp_carga_capacidade(
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL
)
RETURNS TABLE (
  dia date,
  centro_trabalho_id uuid,
  centro_trabalho_nome text,
  capacidade_horas numeric,
  carga_total_horas numeric,
  carga_setup_horas numeric,
  carga_producao_horas numeric,
  carga_em_execucao_horas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dt_ini date := COALESCE(p_data_inicial, now()::date - 3);
  v_dt_fim date := COALESCE(p_data_final, now()::date + 7);
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  WITH periodo AS (
    SELECT
      generate_series(v_dt_ini, v_dt_fim, interval '1 day')::date AS dia,
      EXTRACT(dow FROM generate_series(v_dt_ini, v_dt_fim, interval '1 day')::date)::smallint AS dow
  ),
  centros AS (
    SELECT ct.id, ct.nome, COALESCE(ct.capacidade_horas_dia, 8) AS capacidade_horas_dia
    FROM public.industria_centros_trabalho ct
    WHERE ct.empresa_id = v_empresa_id
      AND ct.ativo = true
  ),
  calendario AS (
    SELECT cal.centro_trabalho_id, cal.dow, cal.capacidade_horas
    FROM public.industria_ct_calendario_semana cal
    WHERE cal.empresa_id = v_empresa_id
  ),
  carga AS (
    SELECT
      o.centro_trabalho_id,
      COALESCE(
        o.data_prevista_inicio,
        o.data_inicio_real::date,
        ord.data_prevista_inicio,
        ord.created_at::date,
        now()::date
      ) AS dia_ref,
      COALESCE(o.tempo_setup_min, 0) / 60.0 AS carga_setup,
      (COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS carga_producao,
      CASE
        WHEN o.status = 'em_execucao' THEN (COALESCE(o.tempo_setup_min, 0) + COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0
        ELSE 0
      END AS carga_execucao
    FROM public.industria_producao_operacoes o
    JOIN public.industria_producao_ordens ord ON ord.id = o.ordem_id
    WHERE o.empresa_id = v_empresa_id
      AND COALESCE(
        o.data_prevista_inicio,
        o.data_inicio_real::date,
        ord.data_prevista_inicio,
        ord.created_at::date,
        now()::date
      ) BETWEEN v_dt_ini AND v_dt_fim
      AND o.centro_trabalho_id IS NOT NULL
  )
  SELECT
    p.dia,
    ct.id,
    ct.nome,
    COALESCE(cal.capacidade_horas, ct.capacidade_horas_dia) AS capacidade_horas,
    COALESCE(SUM(c.carga_setup + c.carga_producao), 0) AS carga_total_horas,
    COALESCE(SUM(c.carga_setup), 0) AS carga_setup_horas,
    COALESCE(SUM(c.carga_producao), 0) AS carga_producao_horas,
    COALESCE(SUM(c.carga_execucao), 0) AS carga_em_execucao_horas
  FROM periodo p
  CROSS JOIN centros ct
  LEFT JOIN calendario cal ON cal.centro_trabalho_id = ct.id AND cal.dow = p.dow
  LEFT JOIN carga c ON c.centro_trabalho_id = ct.id AND c.dia_ref = p.dia
  GROUP BY p.dia, ct.id, ct.nome, COALESCE(cal.capacidade_horas, ct.capacidade_horas_dia)
  ORDER BY p.dia, ct.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_carga_capacidade(date, date) TO authenticated, service_role;

COMMIT;

