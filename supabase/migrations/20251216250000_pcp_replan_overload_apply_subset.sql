-- =============================================================================
-- PCP/APS: Aplicar replanejamento por sobrecarga somente para operações selecionadas
-- - Usa o preview (pcp_replanejar_ct_sobrecarga_preview) para obter new_ini/new_fim
-- - Aplica apenas operações elegíveis e selecionadas (subset), gerando run/undo
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pcp_replanejar_ct_sobrecarga_apply_subset(uuid, date, uuid[], date);
CREATE OR REPLACE FUNCTION public.pcp_replanejar_ct_sobrecarga_apply_subset(
  p_centro_id uuid,
  p_dia date,
  p_operacao_ids uuid[],
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
  v_freeze_dias int := 0;
  v_freeze_until date := now()::date;
  v_peak_capacity numeric := 0;
  v_peak_load numeric := 0;
  v_overload numeric := 0;
  v_moved_count int := 0;
  v_moved_hours numeric := 0;
  v_remaining numeric := 0;
  v_run_id uuid;
BEGIN
  IF p_operacao_ids IS NULL OR COALESCE(array_length(p_operacao_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'moved', 0,
      'message', 'Nenhuma operação selecionada.',
      'peak_day', p_dia,
      'end_day', v_end
    );
  END IF;

  SELECT COALESCE(capacidade_horas_dia, 8)
  INTO v_ct_cap_default
  FROM public.industria_centros_trabalho
  WHERE empresa_id = v_empresa_id
    AND id = p_centro_id;

  SELECT COALESCE(freeze_dias, 0)
  INTO v_freeze_dias
  FROM public.industria_ct_aps_config
  WHERE empresa_id = v_empresa_id
    AND centro_trabalho_id = p_centro_id;

  v_freeze_until := now()::date + COALESCE(v_freeze_dias, 0);

  IF p_dia <= v_freeze_until THEN
    RETURN jsonb_build_object(
      'moved', 0,
      'message', 'Dia está dentro do horizonte congelado; replanejamento bloqueado.',
      'peak_day', p_dia,
      'freeze_until', v_freeze_until
    );
  END IF;

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
    new_fim date NULL,
    horas numeric NOT NULL DEFAULT 0
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

  -- Usa o preview para obter as novas datas previstas (apenas operações elegíveis e selecionadas)
  INSERT INTO tmp_changes (operacao_id, old_ini, old_fim, new_ini, new_fim, horas)
  SELECT
    op.id,
    op.data_prevista_inicio AS old_ini,
    op.data_prevista_fim AS old_fim,
    pvw.new_ini,
    pvw.new_fim,
    COALESCE(pvw.horas, 0)
  FROM public.pcp_replanejar_ct_sobrecarga_preview(p_centro_id, p_dia, v_end, 10000) pvw
  JOIN public.industria_producao_operacoes op
    ON op.id = pvw.operacao_id
   AND op.empresa_id = v_empresa_id
   AND op.centro_trabalho_id = p_centro_id
  WHERE pvw.can_move = true
    AND pvw.operacao_id = ANY(p_operacao_ids);

  SELECT COUNT(*), COALESCE(SUM(horas), 0) INTO v_moved_count, v_moved_hours
  FROM tmp_changes;

  IF v_moved_count = 0 THEN
    RETURN jsonb_build_object(
      'moved', 0,
      'message', 'Nenhuma operação elegível selecionada (locked/freeze/sem slot).',
      'peak_day', p_dia,
      'peak_capacity', v_peak_capacity,
      'peak_load', v_peak_load,
      'end_day', v_end,
      'freeze_until', v_freeze_until
    );
  END IF;

  UPDATE public.industria_producao_operacoes op
  SET data_prevista_inicio = ch.new_ini,
      data_prevista_fim = ch.new_fim,
      updated_at = now()
  FROM tmp_changes ch
  WHERE op.id = ch.operacao_id
    AND op.empresa_id = v_empresa_id
    AND op.centro_trabalho_id = p_centro_id;

  v_remaining := GREATEST(v_overload - v_moved_hours, 0);

  v_run_id := gen_random_uuid();
  INSERT INTO public.pcp_aps_runs (id, empresa_id, kind, centro_trabalho_id, created_by, params, summary)
  VALUES (
    v_run_id,
    v_empresa_id,
    'replan_overload',
    p_centro_id,
    auth.uid(),
    jsonb_build_object(
      'peak_day', p_dia,
      'data_final', v_end,
      'freeze_dias', COALESCE(v_freeze_dias, 0),
      'mode', 'subset',
      'selected_count', COALESCE(array_length(p_operacao_ids, 1), 0),
      'applied_count', v_moved_count
    ),
    jsonb_build_object(
      'moved', v_moved_count,
      'remaining_overload_hours', v_remaining,
      'peak_capacity', v_peak_capacity,
      'peak_load', v_peak_load
    )
  );

  INSERT INTO public.pcp_aps_run_changes (run_id, empresa_id, operacao_id, old_ini, old_fim, new_ini, new_fim)
  SELECT v_run_id, v_empresa_id, operacao_id, old_ini, old_fim, new_ini, new_fim
  FROM tmp_changes
  WHERE (old_ini IS DISTINCT FROM new_ini OR old_fim IS DISTINCT FROM new_fim);

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'moved', v_moved_count,
    'remaining_overload_hours', v_remaining,
    'peak_day', p_dia,
    'peak_capacity', v_peak_capacity,
    'peak_load', v_peak_load,
    'end_day', v_end,
    'freeze_until', v_freeze_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_replanejar_ct_sobrecarga_apply_subset(uuid, date, uuid[], date) TO authenticated, service_role;

COMMIT;

