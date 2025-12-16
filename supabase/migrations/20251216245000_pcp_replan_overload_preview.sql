-- =============================================================================
-- PCP/APS: Preview do replanejamento por sobrecarga (sem aplicar alterações)
-- - Simula o comportamento de pcp_replanejar_ct_sobrecarga
-- - Explica por que cada operação não pode ser movida (locked/freeze/sem folga)
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pcp_replanejar_ct_sobrecarga_preview(uuid, date, date, integer);
CREATE OR REPLACE FUNCTION public.pcp_replanejar_ct_sobrecarga_preview(
  p_centro_id uuid,
  p_dia date,
  p_data_final date DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  operacao_id uuid,
  ordem_id uuid,
  ordem_numero integer,
  produto_nome text,
  horas numeric,
  old_ini date,
  old_fim date,
  new_ini date,
  new_fim date,
  can_move boolean,
  reason text,
  freeze_until date
)
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
  v_remaining numeric := 0;
  v_target_day date;
  v_limit int := COALESCE(p_limit, 200);
  v_count int := 0;
  rec record;
BEGIN
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
  v_remaining := v_overload;

  FOR rec IN
    SELECT
      op.id AS operacao_id,
      op.ordem_id,
      ord.numero AS ordem_numero,
      prod.nome AS produto_nome,
      (COALESCE(op.tempo_setup_min, 0) / 60.0)
        + (COALESCE(op.quantidade_planejada, 0) * COALESCE(op.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS horas,
      COALESCE(ord.prioridade, 0) AS prioridade,
      op.data_prevista_inicio AS old_ini,
      op.data_prevista_fim AS old_fim,
      COALESCE(op.aps_locked, false) AS aps_locked
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens ord ON ord.id = op.ordem_id
    JOIN public.produtos prod ON prod.id = ord.produto_final_id
    WHERE op.empresa_id = v_empresa_id
      AND op.centro_trabalho_id = p_centro_id
      AND op.data_inicio_real IS NULL
      AND op.data_fim_real IS NULL
      AND op.status NOT IN ('em_execucao', 'concluida', 'cancelada')
      AND COALESCE(op.data_prevista_inicio, ord.data_prevista_inicio, ord.created_at::date, now()::date) = p_dia
    ORDER BY COALESCE(ord.prioridade, 0) ASC, op.created_at DESC
  LOOP
    EXIT WHEN v_count >= v_limit;
    v_count := v_count + 1;

    IF v_overload <= 0.01 THEN
      RETURN QUERY SELECT
        rec.operacao_id, rec.ordem_id, rec.ordem_numero, rec.produto_nome,
        rec.horas, rec.old_ini, rec.old_fim,
        rec.old_ini, rec.old_fim,
        false, 'no_overload'::text, v_freeze_until;
      CONTINUE;
    END IF;

    IF rec.aps_locked THEN
      RETURN QUERY SELECT
        rec.operacao_id, rec.ordem_id, rec.ordem_numero, rec.produto_nome,
        rec.horas, rec.old_ini, rec.old_fim,
        rec.old_ini, rec.old_fim,
        false, 'locked'::text, v_freeze_until;
      CONTINUE;
    END IF;

    IF rec.horas IS NULL OR rec.horas <= 0.0001 THEN
      RETURN QUERY SELECT
        rec.operacao_id, rec.ordem_id, rec.ordem_numero, rec.produto_nome,
        rec.horas, rec.old_ini, rec.old_fim,
        rec.old_ini, rec.old_fim,
        false, 'zero_hours'::text, v_freeze_until;
      CONTINUE;
    END IF;

    SELECT dia INTO v_target_day
    FROM tmp_days
    WHERE dia > p_dia
      AND dia > v_freeze_until
      AND folga >= rec.horas
    ORDER BY dia
    LIMIT 1;

    IF v_target_day IS NULL THEN
      RETURN QUERY SELECT
        rec.operacao_id, rec.ordem_id, rec.ordem_numero, rec.produto_nome,
        rec.horas, rec.old_ini, rec.old_fim,
        rec.old_ini, rec.old_fim,
        false, 'no_slot'::text, v_freeze_until;
      CONTINUE;
    END IF;

    -- Simula ajustes de folga/carga (sem escrever na tabela real)
    UPDATE tmp_days
    SET carga = carga + rec.horas,
        folga = GREATEST(folga - rec.horas, 0)
    WHERE dia = v_target_day;

    UPDATE tmp_days
    SET carga = GREATEST(carga - rec.horas, 0),
        folga = folga + rec.horas
    WHERE dia = p_dia;

    v_remaining := GREATEST(v_remaining - rec.horas, 0);

    RETURN QUERY SELECT
      rec.operacao_id, rec.ordem_id, rec.ordem_numero, rec.produto_nome,
      rec.horas, rec.old_ini, rec.old_fim,
      v_target_day, v_target_day,
      true, 'ok'::text, v_freeze_until;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_replanejar_ct_sobrecarga_preview(uuid, date, date, integer) TO authenticated, service_role;

COMMIT;

