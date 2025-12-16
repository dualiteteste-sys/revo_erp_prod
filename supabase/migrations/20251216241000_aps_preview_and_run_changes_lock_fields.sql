-- =============================================================================
-- APS v1.6: campos de lock no preview e no detalhamento de runs
-- - pcp_aps_preview_sequenciar_ct passa a retornar lock/skip_reason
-- - pcp_aps_run_changes_list passa a retornar lock + motivo
-- =============================================================================

BEGIN;

-- 1) Detalhes de mudanças por run: inclui lock atual (para ação na UI)
DROP FUNCTION IF EXISTS public.pcp_aps_run_changes_list(uuid, integer);
CREATE OR REPLACE FUNCTION public.pcp_aps_run_changes_list(
  p_run_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  operacao_id uuid,
  ordem_id uuid,
  ordem_numero integer,
  produto_nome text,
  centro_trabalho_id uuid,
  status_operacao text,
  old_ini date,
  old_fim date,
  new_ini date,
  new_fim date,
  aps_locked boolean,
  aps_lock_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    c.operacao_id,
    op.ordem_id,
    ord.numero,
    prod.nome AS produto_nome,
    op.centro_trabalho_id,
    op.status,
    c.old_ini,
    c.old_fim,
    c.new_ini,
    c.new_fim,
    COALESCE(op.aps_locked, false) AS aps_locked,
    op.aps_lock_reason
  FROM public.pcp_aps_run_changes c
  JOIN public.industria_producao_operacoes op ON op.id = c.operacao_id
  JOIN public.industria_producao_ordens ord ON ord.id = op.ordem_id
  JOIN public.produtos prod ON prod.id = ord.produto_final_id
  WHERE c.empresa_id = v_empresa_id
    AND c.run_id = p_run_id
  ORDER BY ord.numero DESC, op.sequencia ASC, op.created_at ASC
  LIMIT COALESCE(p_limit, 200);
END;
$$;

-- 2) Preview detalhado do sequenciamento: inclui lock e motivo de skip
DROP FUNCTION IF EXISTS public.pcp_aps_preview_sequenciar_ct(uuid, date, date, integer);
CREATE OR REPLACE FUNCTION public.pcp_aps_preview_sequenciar_ct(
  p_centro_id uuid,
  p_data_inicial date,
  p_data_final date,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  operacao_id uuid,
  ordem_id uuid,
  ordem_numero integer,
  produto_nome text,
  old_ini date,
  old_fim date,
  new_ini date,
  new_fim date,
  scheduled boolean,
  aps_locked boolean,
  aps_lock_reason text,
  skip_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_dt_ini date := COALESCE(p_data_inicial, now()::date);
  v_dt_fim date := COALESCE(p_data_final, now()::date + 14);
  v_cap_default numeric;
  v_freeze_dias int := 0;
  v_freeze_until date := now()::date;
  v_now date := now()::date;
  v_day date;
  v_start date;
  v_end date;
  v_remaining numeric;
  v_take numeric;
  v_idx int;
  v_count int := 0;
  v_limit int := COALESCE(p_limit, 200);
  rec record;
BEGIN
  IF v_dt_fim < v_dt_ini THEN
    RAISE EXCEPTION 'Data final deve ser >= data inicial.';
  END IF;

  SELECT COALESCE(capacidade_horas_dia, 8)
  INTO v_cap_default
  FROM public.industria_centros_trabalho
  WHERE empresa_id = v_empresa_id
    AND id = p_centro_id
    AND ativo = true;

  SELECT COALESCE(freeze_dias, 0)
  INTO v_freeze_dias
  FROM public.industria_ct_aps_config
  WHERE empresa_id = v_empresa_id
    AND centro_trabalho_id = p_centro_id;

  v_freeze_until := v_now + COALESCE(v_freeze_dias, 0);

  IF v_cap_default IS NULL THEN
    RAISE EXCEPTION 'Centro de trabalho não encontrado/ativo.';
  END IF;

  CREATE TEMP TABLE tmp_days (
    idx int PRIMARY KEY,
    dia date NOT NULL,
    capacidade numeric NOT NULL,
    restante numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_days (idx, dia, capacidade, restante)
  WITH periodo AS (
    SELECT
      generate_series(v_dt_ini, v_dt_fim, interval '1 day')::date AS dia,
      EXTRACT(dow FROM generate_series(v_dt_ini, v_dt_fim, interval '1 day')::date)::smallint AS dow
  ),
  cal AS (
    SELECT dow, capacidade_horas
    FROM public.industria_ct_calendario_semana
    WHERE empresa_id = v_empresa_id
      AND centro_trabalho_id = p_centro_id
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY p.dia) - 1 AS idx,
    p.dia,
    COALESCE(c.capacidade_horas, v_cap_default) AS capacidade,
    COALESCE(c.capacidade_horas, v_cap_default) AS restante
  FROM periodo p
  LEFT JOIN cal c ON c.dow = p.dow;

  -- Pointer inicial: freeze_until + 1, ou data inicial (o que for maior)
  SELECT idx INTO v_idx
  FROM tmp_days
  WHERE dia = GREATEST(v_dt_ini, v_freeze_until + 1)
  LIMIT 1;

  IF v_idx IS NULL THEN
    v_idx := 0;
  END IF;

  FOR rec IN
    SELECT
      op.id AS operacao_id,
      op.ordem_id,
      ord.numero AS ordem_numero,
      prod.nome AS produto_nome,
      COALESCE(ord.prioridade, 0) AS prioridade,
      op.sequencia,
      op.created_at,
      (COALESCE(op.tempo_setup_min, 0) / 60.0)
        + (COALESCE(op.quantidade_planejada, 0) * COALESCE(op.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS horas,
      op.data_prevista_inicio AS old_ini,
      op.data_prevista_fim AS old_fim,
      COALESCE(op.data_prevista_inicio, ord.data_prevista_inicio, ord.created_at::date, v_now) AS effective_day,
      COALESCE(op.aps_locked, false) AS aps_locked,
      op.aps_lock_reason AS aps_lock_reason
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens ord ON ord.id = op.ordem_id
    JOIN public.produtos prod ON prod.id = ord.produto_final_id
    WHERE op.empresa_id = v_empresa_id
      AND op.centro_trabalho_id = p_centro_id
      AND op.status NOT IN ('em_execucao', 'concluida', 'cancelada')
      AND op.data_inicio_real IS NULL
      AND op.data_fim_real IS NULL
    ORDER BY COALESCE(ord.prioridade, 0) DESC, op.sequencia ASC, op.created_at ASC
  LOOP
    EXIT WHEN v_count >= v_limit;

    IF rec.aps_locked THEN
      v_count := v_count + 1;
      RETURN NEXT (
        rec.operacao_id,
        rec.ordem_id,
        rec.ordem_numero,
        rec.produto_nome,
        rec.old_ini,
        rec.old_fim,
        rec.old_ini,
        rec.old_fim,
        false,
        true,
        rec.aps_lock_reason,
        'locked'
      );
      CONTINUE;
    END IF;

    IF rec.effective_day <= v_freeze_until THEN
      v_count := v_count + 1;
      RETURN NEXT (
        rec.operacao_id,
        rec.ordem_id,
        rec.ordem_numero,
        rec.produto_nome,
        rec.old_ini,
        rec.old_fim,
        rec.old_ini,
        rec.old_fim,
        false,
        false,
        NULL::text,
        'freeze'
      );
      CONTINUE;
    END IF;

    v_remaining := COALESCE(rec.horas, 0);
    IF v_remaining <= 0.0001 THEN
      CONTINUE;
    END IF;

    v_start := NULL;
    v_end := NULL;

    WHILE v_remaining > 0.0001 LOOP
      SELECT dia, restante INTO v_day, v_take
      FROM tmp_days
      WHERE idx >= v_idx
        AND restante > 0.0001
      ORDER BY idx
      LIMIT 1;

      IF v_day IS NULL THEN
        EXIT;
      END IF;

      IF v_start IS NULL THEN
        v_start := v_day;
      END IF;
      v_end := v_day;

      v_take := LEAST(v_remaining, v_take);
      UPDATE tmp_days
      SET restante = GREATEST(restante - v_take, 0)
      WHERE dia = v_day;

      v_remaining := v_remaining - v_take;
      v_day := NULL;
    END LOOP;

    IF v_start IS NULL OR v_end IS NULL THEN
      v_count := v_count + 1;
      RETURN NEXT (
        rec.operacao_id,
        rec.ordem_id,
        rec.ordem_numero,
        rec.produto_nome,
        rec.old_ini,
        rec.old_fim,
        NULL::date,
        NULL::date,
        false,
        false,
        NULL::text,
        NULL::text
      );
    ELSE
      IF rec.old_ini IS DISTINCT FROM v_start OR rec.old_fim IS DISTINCT FROM v_end THEN
        v_count := v_count + 1;
        RETURN NEXT (
          rec.operacao_id,
          rec.ordem_id,
          rec.ordem_numero,
          rec.produto_nome,
          rec.old_ini,
          rec.old_fim,
          v_start,
          v_end,
          true,
          false,
          NULL::text,
          NULL::text
        );
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_aps_run_changes_list(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_preview_sequenciar_ct(uuid, date, date, integer) TO authenticated, service_role;

COMMIT;

