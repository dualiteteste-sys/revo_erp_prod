-- =============================================================================
-- APS v1.2: log de execuções + undo para sequenciamento
-- =============================================================================

BEGIN;

-- 1) Tabelas de auditoria
CREATE TABLE IF NOT EXISTS public.pcp_aps_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sequencing', 'replan_overload')),
  centro_trabalho_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pcp_aps_runs_empresa_ct_created
  ON public.pcp_aps_runs (empresa_id, centro_trabalho_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pcp_aps_run_changes (
  run_id uuid NOT NULL REFERENCES public.pcp_aps_runs(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  operacao_id uuid NOT NULL REFERENCES public.industria_producao_operacoes(id) ON DELETE CASCADE,
  old_ini date NULL,
  old_fim date NULL,
  new_ini date NULL,
  new_fim date NULL,
  PRIMARY KEY (run_id, operacao_id)
);

CREATE INDEX IF NOT EXISTS idx_pcp_aps_run_changes_empresa_op
  ON public.pcp_aps_run_changes (empresa_id, operacao_id);

-- 2) Recria sequenciador para incluir log (somente quando apply=true)
DROP FUNCTION IF EXISTS public.pcp_aps_sequenciar_ct(uuid, date, date, boolean);
CREATE OR REPLACE FUNCTION public.pcp_aps_sequenciar_ct(
  p_centro_id uuid,
  p_data_inicial date,
  p_data_final date,
  p_apply boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_dt_ini date := COALESCE(p_data_inicial, now()::date);
  v_dt_fim date := COALESCE(p_data_final, now()::date + 14);
  v_cap_default numeric;
  v_changed int := 0;
  v_unscheduled int := 0;
  v_total int := 0;
  v_now date := now()::date;
  v_day date;
  v_start date;
  v_end date;
  v_remaining numeric;
  v_take numeric;
  v_idx int;
  v_run_id uuid;
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

  CREATE TEMP TABLE tmp_changes (
    operacao_id uuid PRIMARY KEY,
    old_ini date NULL,
    old_fim date NULL,
    new_ini date NULL,
    new_fim date NULL
  ) ON COMMIT DROP;

  -- Pointer inicial: hoje ou data inicial (o que for maior)
  SELECT idx INTO v_idx
  FROM tmp_days
  WHERE dia = GREATEST(v_dt_ini, v_now)
  LIMIT 1;

  IF v_idx IS NULL THEN
    v_idx := 0;
  END IF;

  FOR rec IN
    SELECT
      op.id AS operacao_id,
      COALESCE(ord.prioridade, 0) AS prioridade,
      op.sequencia,
      op.created_at,
      (COALESCE(op.tempo_setup_min, 0) / 60.0)
        + (COALESCE(op.quantidade_planejada, 0) * COALESCE(op.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS horas,
      op.data_prevista_inicio AS old_ini,
      op.data_prevista_fim AS old_fim
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens ord ON ord.id = op.ordem_id
    WHERE op.empresa_id = v_empresa_id
      AND op.centro_trabalho_id = p_centro_id
      AND op.status NOT IN ('em_execucao', 'concluida', 'cancelada')
      AND op.data_inicio_real IS NULL
      AND op.data_fim_real IS NULL
    ORDER BY COALESCE(ord.prioridade, 0) DESC, op.sequencia ASC, op.created_at ASC
  LOOP
    v_total := v_total + 1;
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
        v_unscheduled := v_unscheduled + 1;
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

    IF v_remaining > 0.0001 OR v_start IS NULL OR v_end IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO tmp_changes (operacao_id, old_ini, old_fim, new_ini, new_fim)
    VALUES (rec.operacao_id, rec.old_ini, rec.old_fim, v_start, v_end)
    ON CONFLICT (operacao_id) DO UPDATE SET
      old_ini = EXCLUDED.old_ini,
      old_fim = EXCLUDED.old_fim,
      new_ini = EXCLUDED.new_ini,
      new_fim = EXCLUDED.new_fim;

    IF p_apply THEN
      UPDATE public.industria_producao_operacoes
      SET data_prevista_inicio = v_start,
          data_prevista_fim = v_end,
          updated_at = now()
      WHERE id = rec.operacao_id
        AND empresa_id = v_empresa_id;
    END IF;

    IF rec.old_ini IS DISTINCT FROM v_start OR rec.old_fim IS DISTINCT FROM v_end THEN
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  IF p_apply THEN
    v_run_id := gen_random_uuid();
    INSERT INTO public.pcp_aps_runs (id, empresa_id, kind, centro_trabalho_id, created_by, params, summary)
    VALUES (
      v_run_id,
      v_empresa_id,
      'sequencing',
      p_centro_id,
      auth.uid(),
      jsonb_build_object('data_inicial', v_dt_ini, 'data_final', v_dt_fim),
      jsonb_build_object('total_operacoes', v_total, 'updated_operacoes', v_changed, 'unscheduled_operacoes', v_unscheduled)
    );

    INSERT INTO public.pcp_aps_run_changes (run_id, empresa_id, operacao_id, old_ini, old_fim, new_ini, new_fim)
    SELECT v_run_id, v_empresa_id, operacao_id, old_ini, old_fim, new_ini, new_fim
    FROM tmp_changes
    WHERE (old_ini IS DISTINCT FROM new_ini OR old_fim IS DISTINCT FROM new_fim);
  END IF;

  RETURN jsonb_build_object(
    'apply', p_apply,
    'run_id', v_run_id,
    'centro_id', p_centro_id,
    'data_inicial', v_dt_ini,
    'data_final', v_dt_fim,
    'total_operacoes', v_total,
    'updated_operacoes', v_changed,
    'unscheduled_operacoes', v_unscheduled
  );
END;
$$;

-- 3) Listagem de runs (últimos)
DROP FUNCTION IF EXISTS public.pcp_aps_list_runs(uuid, integer);
CREATE OR REPLACE FUNCTION public.pcp_aps_list_runs(
  p_centro_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  kind text,
  created_at timestamptz,
  created_by uuid,
  summary jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT r.id, r.kind, r.created_at, r.created_by, r.summary
  FROM public.pcp_aps_runs r
  WHERE r.empresa_id = v_empresa_id
    AND r.centro_trabalho_id = p_centro_id
  ORDER BY r.created_at DESC
  LIMIT COALESCE(p_limit, 10);
END;
$$;

-- 4) Undo (reverte apenas se o registro ainda está com os valores "new")
DROP FUNCTION IF EXISTS public.pcp_aps_undo(uuid);
CREATE OR REPLACE FUNCTION public.pcp_aps_undo(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_restored int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pcp_aps_runs r
    WHERE r.id = p_run_id
      AND r.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Run não encontrado.';
  END IF;

  WITH changed AS (
    SELECT c.operacao_id, c.old_ini, c.old_fim, c.new_ini, c.new_fim
    FROM public.pcp_aps_run_changes c
    WHERE c.run_id = p_run_id
      AND c.empresa_id = v_empresa_id
  ),
  updated AS (
    UPDATE public.industria_producao_operacoes op
    SET data_prevista_inicio = ch.old_ini,
        data_prevista_fim = ch.old_fim,
        updated_at = now()
    FROM changed ch
    WHERE op.id = ch.operacao_id
      AND op.empresa_id = v_empresa_id
      AND op.data_prevista_inicio IS NOT DISTINCT FROM ch.new_ini
      AND op.data_prevista_fim IS NOT DISTINCT FROM ch.new_fim
    RETURNING op.id
  )
  SELECT COUNT(*) INTO v_restored FROM updated;

  SELECT COUNT(*) INTO v_skipped
  FROM changed ch
  WHERE NOT EXISTS (
    SELECT 1 FROM public.industria_producao_operacoes op
    WHERE op.id = ch.operacao_id
      AND op.empresa_id = v_empresa_id
      AND op.data_prevista_inicio IS NOT DISTINCT FROM ch.new_ini
      AND op.data_prevista_fim IS NOT DISTINCT FROM ch.new_fim
  );

  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'restored', v_restored,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_aps_sequenciar_ct(uuid, date, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_list_runs(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_undo(uuid) TO authenticated, service_role;

COMMIT;

