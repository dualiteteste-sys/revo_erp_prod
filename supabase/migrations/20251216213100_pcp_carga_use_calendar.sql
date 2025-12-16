-- =============================================================================
-- APS v1: usar calendário semanal de CT na capacidade do PCP
-- =============================================================================

BEGIN;

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
    SELECT id, nome, COALESCE(capacidade_horas_dia, 8) AS capacidade_horas_dia
    FROM public.industria_centros_trabalho
    WHERE empresa_id = v_empresa_id
      AND ativo = true
  ),
  calendario AS (
    SELECT centro_trabalho_id, dow, capacidade_horas
    FROM public.industria_ct_calendario_semana
    WHERE empresa_id = v_empresa_id
  ),
  carga AS (
    SELECT
      o.centro_trabalho_id,
      COALESCE(o.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) AS dia_ref,
      COALESCE(o.tempo_setup_min, 0) / 60.0 AS carga_setup,
      (COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS carga_producao,
      CASE
        WHEN o.status = 'em_execucao' THEN (COALESCE(o.tempo_setup_min, 0) + COALESCE(o.quantidade_planejada, 0) * COALESCE(o.tempo_ciclo_min_por_unidade, 0)) / 60.0
        ELSE 0
      END AS carga_execucao
    FROM public.industria_producao_operacoes o
    JOIN public.industria_producao_ordens ord ON ord.id = o.ordem_id
    WHERE o.empresa_id = v_empresa_id
      AND COALESCE(o.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date)
          BETWEEN v_dt_ini AND v_dt_fim
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

COMMIT;

