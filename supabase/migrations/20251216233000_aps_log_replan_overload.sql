-- =============================================================================
-- APS v1.3: log/undo para replanejamento por sobrecarga (pcp_replanejar_ct_sobrecarga)
-- =============================================================================

BEGIN;

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
  v_run_id uuid;
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

  CREATE TEMP TABLE tmp_changes (
    operacao_id uuid PRIMARY KEY,
    old_ini date NULL,
    old_fim date NULL,
    new_ini date NULL,
    new_fim date NULL
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
      COALESCE(ord.prioridade, 0) AS prioridade,
      op.data_prevista_inicio AS old_ini,
      op.data_prevista_fim AS old_fim
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

    INSERT INTO tmp_changes (operacao_id, old_ini, old_fim, new_ini, new_fim)
    VALUES (rec.operacao_id, rec.old_ini, rec.old_fim, v_target_day, v_target_day)
    ON CONFLICT (operacao_id) DO UPDATE SET
      old_ini = EXCLUDED.old_ini,
      old_fim = EXCLUDED.old_fim,
      new_ini = EXCLUDED.new_ini,
      new_fim = EXCLUDED.new_fim;

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

  IF v_moved_count > 0 THEN
    v_run_id := gen_random_uuid();
    INSERT INTO public.pcp_aps_runs (id, empresa_id, kind, centro_trabalho_id, created_by, params, summary)
    VALUES (
      v_run_id,
      v_empresa_id,
      'replan_overload',
      p_centro_id,
      auth.uid(),
      jsonb_build_object('peak_day', p_dia, 'data_final', v_end),
      jsonb_build_object('moved', v_moved_count, 'remaining_overload_hours', v_remaining, 'peak_capacity', v_peak_capacity, 'peak_load', v_peak_load)
    );

    INSERT INTO public.pcp_aps_run_changes (run_id, empresa_id, operacao_id, old_ini, old_fim, new_ini, new_fim)
    SELECT v_run_id, v_empresa_id, operacao_id, old_ini, old_fim, new_ini, new_fim
    FROM tmp_changes
    WHERE (old_ini IS DISTINCT FROM new_ini OR old_fim IS DISTINCT FROM new_fim);
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'moved', v_moved_count,
    'remaining_overload_hours', v_remaining,
    'peak_day', p_dia,
    'peak_capacity', v_peak_capacity,
    'peak_load', v_peak_load,
    'end_day', v_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_replanejar_ct_sobrecarga(uuid, date, date) TO authenticated, service_role;

COMMIT;

