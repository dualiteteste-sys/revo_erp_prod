-- =============================================================================
-- APS v1: replanejamento simples por sobrecarga de CT (dia)
-- - adiciona datas previstas na operação
-- - atualiza PCP (carga/gantt) para usar as datas da operação quando existirem
-- - cria RPC para empurrar operações de menor prioridade para dias com folga
-- =============================================================================

BEGIN;

-- 1) Colunas de planejamento por operação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'industria_producao_operacoes'
      AND column_name = 'data_prevista_inicio'
  ) THEN
    ALTER TABLE public.industria_producao_operacoes ADD COLUMN data_prevista_inicio date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'industria_producao_operacoes'
      AND column_name = 'data_prevista_fim'
  ) THEN
    ALTER TABLE public.industria_producao_operacoes ADD COLUMN data_prevista_fim date;
  END IF;
END$$;

-- 2) PCP: carga/capacidade usa data prevista da operação (se existir)
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

-- 3) PCP: Gantt usa data prevista da operação (se existir)
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
  transfer_ratio numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dt_ini date := COALESCE(p_data_inicial, now()::date - 7);
  v_dt_fim date := COALESCE(p_data_final, now()::date + 14);
BEGIN
  RETURN QUERY
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
    END AS transfer_ratio
  FROM public.industria_producao_ordens ord
  JOIN public.produtos prod ON prod.id = ord.produto_final_id
  JOIN public.industria_producao_operacoes op ON op.ordem_id = ord.id
  WHERE ord.empresa_id = public.current_empresa_id()
    AND (
      COALESCE(op.data_prevista_inicio, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
      OR COALESCE(op.data_prevista_fim, ord.data_prevista_fim, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
      OR COALESCE(op.data_inicio_real::date, ord.data_prevista_inicio, ord.created_at::date, now()::date) BETWEEN v_dt_ini AND v_dt_fim
    )
  ORDER BY ord.data_prevista_inicio NULLS LAST, ord.numero, op.sequencia;
END;
$$;

-- 4) RPC: empurra operações do dia (menor prioridade) para dias futuros com folga
DROP FUNCTION IF EXISTS public.pcp_replanejar_ct_sobrecarga(uuid, date, date);
CREATE OR REPLACE FUNCTION public.pcp_replanejar_ct_sobrecarga(
  p_centro_id uuid,
  p_dia date,
  p_data_final date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_end date := COALESCE(p_data_final, p_dia + 14);
  v_ct_cap_default numeric;
  v_peak_capacity numeric := 0;
  v_peak_load numeric := 0;
  v_overload numeric := 0;
  v_moved_count int := 0;
  v_remaining numeric := 0;
  v_target_day date;
  rec record;
BEGIN
  SELECT COALESCE(capacidade_horas_dia, 8)
  INTO v_ct_cap_default
  FROM public.industria_centros_trabalho
  WHERE empresa_id = v_empresa_id
    AND id = p_centro_id;

  IF v_ct_cap_default IS NULL THEN
    RAISE EXCEPTION 'Centro de trabalho não encontrado.';
  END IF;

  CREATE TEMP TABLE tmp_days (
    dia date PRIMARY KEY,
    capacidade numeric NOT NULL,
    carga numeric NOT NULL,
    folga numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_days (dia, capacidade, carga, folga)
  WITH periodo AS (
    SELECT
      generate_series(p_dia, v_end, interval '1 day')::date AS dia,
      EXTRACT(dow FROM generate_series(p_dia, v_end, interval '1 day')::date)::smallint AS dow
  ),
  cal AS (
    SELECT dow, capacidade_horas
    FROM public.industria_ct_calendario_semana
    WHERE empresa_id = v_empresa_id
      AND centro_trabalho_id = p_centro_id
  ),
  cargas AS (
    SELECT
      COALESCE(
        op.data_prevista_inicio,
        op.data_inicio_real::date,
        ord.data_prevista_inicio,
        ord.created_at::date,
        now()::date
      ) AS dia_ref,
      SUM(
        (COALESCE(op.tempo_setup_min, 0) / 60.0)
        + (COALESCE(op.quantidade_planejada, 0) * COALESCE(op.tempo_ciclo_min_por_unidade, 0)) / 60.0
      ) AS carga_horas
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens ord ON ord.id = op.ordem_id
    WHERE op.empresa_id = v_empresa_id
      AND op.centro_trabalho_id = p_centro_id
      AND COALESCE(
        op.data_prevista_inicio,
        op.data_inicio_real::date,
        ord.data_prevista_inicio,
        ord.created_at::date,
        now()::date
      ) BETWEEN p_dia AND v_end
      AND op.status <> 'cancelada'
    GROUP BY 1
  )
  SELECT
    p.dia,
    COALESCE(c.capacidade_horas, v_ct_cap_default) AS capacidade,
    COALESCE(cg.carga_horas, 0) AS carga,
    GREATEST(COALESCE(c.capacidade_horas, v_ct_cap_default) - COALESCE(cg.carga_horas, 0), 0) AS folga
  FROM periodo p
  LEFT JOIN cal c ON c.dow = p.dow
  LEFT JOIN cargas cg ON cg.dia_ref = p.dia;

  SELECT capacidade, carga INTO v_peak_capacity, v_peak_load
  FROM tmp_days
  WHERE dia = p_dia;

  v_overload := GREATEST(v_peak_load - v_peak_capacity, 0);
  IF v_overload <= 0.01 THEN
    RETURN jsonb_build_object(
      'moved', 0,
      'message', 'Sem sobrecarga no dia informado.',
      'peak_day', p_dia,
      'peak_capacity', v_peak_capacity,
      'peak_load', v_peak_load
    );
  END IF;

  v_remaining := v_overload;

  FOR rec IN
    SELECT
      op.id AS operacao_id,
      (COALESCE(op.tempo_setup_min, 0) / 60.0)
        + (COALESCE(op.quantidade_planejada, 0) * COALESCE(op.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS horas,
      COALESCE(ord.prioridade, 0) AS prioridade
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens ord ON ord.id = op.ordem_id
    WHERE op.empresa_id = v_empresa_id
      AND op.centro_trabalho_id = p_centro_id
      AND op.data_inicio_real IS NULL
      AND op.data_fim_real IS NULL
      AND op.status NOT IN ('em_execucao', 'concluida', 'cancelada')
      AND COALESCE(op.data_prevista_inicio, ord.data_prevista_inicio, ord.created_at::date, now()::date) = p_dia
    ORDER BY COALESCE(ord.prioridade, 0) ASC, op.created_at DESC
  LOOP
    EXIT WHEN v_remaining <= 0.01;
    IF rec.horas IS NULL OR rec.horas <= 0.0001 THEN
      CONTINUE;
    END IF;

    SELECT dia INTO v_target_day
    FROM tmp_days
    WHERE dia > p_dia
      AND folga >= rec.horas
    ORDER BY dia
    LIMIT 1;

    IF v_target_day IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.industria_producao_operacoes
    SET data_prevista_inicio = v_target_day,
        data_prevista_fim = v_target_day,
        updated_at = now()
    WHERE id = rec.operacao_id
      AND empresa_id = v_empresa_id;

    UPDATE tmp_days
    SET carga = carga + rec.horas,
        folga = GREATEST(folga - rec.horas, 0)
    WHERE dia = v_target_day;

    UPDATE tmp_days
    SET carga = GREATEST(carga - rec.horas, 0),
        folga = folga + rec.horas
    WHERE dia = p_dia;

    v_moved_count := v_moved_count + 1;
    v_remaining := GREATEST(v_remaining - rec.horas, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'moved', v_moved_count,
    'remaining_overload_hours', v_remaining,
    'peak_day', p_dia,
    'peak_capacity', v_peak_capacity,
    'peak_load', v_peak_load,
    'end_day', v_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_carga_capacidade(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_gantt_ordens(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_replanejar_ct_sobrecarga(uuid, date, date) TO authenticated, service_role;

COMMIT;

