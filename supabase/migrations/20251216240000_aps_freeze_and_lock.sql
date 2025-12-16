-- =============================================================================
-- APS v1.5: horizonte congelado (freeze) + lock manual por operação
-- - CT config: freeze_dias
-- - Operação: aps_locked + reason
-- - Sequenciador/preview/replan respeitam freeze e lock
-- =============================================================================

BEGIN;

-- 1) Config APS por Centro de Trabalho
CREATE TABLE IF NOT EXISTS public.industria_ct_aps_config (
  empresa_id uuid NOT NULL,
  centro_trabalho_id uuid NOT NULL REFERENCES public.industria_centros_trabalho(id) ON DELETE CASCADE,
  freeze_dias int NOT NULL DEFAULT 0 CHECK (freeze_dias >= 0 AND freeze_dias <= 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, centro_trabalho_id)
);

CREATE INDEX IF NOT EXISTS idx_industria_ct_aps_config_empresa_ct
  ON public.industria_ct_aps_config (empresa_id, centro_trabalho_id);

DROP TRIGGER IF EXISTS tg_industria_ct_aps_config_updated_at ON public.industria_ct_aps_config;
CREATE TRIGGER tg_industria_ct_aps_config_updated_at
BEFORE UPDATE ON public.industria_ct_aps_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- 2) Lock manual por operação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'industria_producao_operacoes'
      AND column_name = 'aps_locked'
  ) THEN
    ALTER TABLE public.industria_producao_operacoes ADD COLUMN aps_locked boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'industria_producao_operacoes'
      AND column_name = 'aps_lock_reason'
  ) THEN
    ALTER TABLE public.industria_producao_operacoes ADD COLUMN aps_lock_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'industria_producao_operacoes'
      AND column_name = 'aps_locked_at'
  ) THEN
    ALTER TABLE public.industria_producao_operacoes ADD COLUMN aps_locked_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'industria_producao_operacoes'
      AND column_name = 'aps_locked_by'
  ) THEN
    ALTER TABLE public.industria_producao_operacoes ADD COLUMN aps_locked_by uuid;
  END IF;
END$$;

-- 3) RPCs CT APS config
DROP FUNCTION IF EXISTS public.industria_ct_aps_config_get(uuid);
CREATE OR REPLACE FUNCTION public.industria_ct_aps_config_get(p_centro_id uuid)
RETURNS TABLE (
  freeze_dias int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT COALESCE(c.freeze_dias, 0) AS freeze_dias
  FROM public.industria_ct_aps_config c
  WHERE c.empresa_id = v_empresa_id
    AND c.centro_trabalho_id = p_centro_id;
END;
$$;

DROP FUNCTION IF EXISTS public.industria_ct_aps_config_upsert(uuid, int);
CREATE OR REPLACE FUNCTION public.industria_ct_aps_config_upsert(
  p_centro_id uuid,
  p_freeze_dias int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  INSERT INTO public.industria_ct_aps_config (empresa_id, centro_trabalho_id, freeze_dias)
  VALUES (v_empresa_id, p_centro_id, GREATEST(LEAST(COALESCE(p_freeze_dias, 0), 30), 0))
  ON CONFLICT (empresa_id, centro_trabalho_id)
  DO UPDATE SET freeze_dias = EXCLUDED.freeze_dias, updated_at = now();
END;
$$;

-- 4) RPC lock/unlock operação
DROP FUNCTION IF EXISTS public.industria_operacao_aps_lock_set(uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.industria_operacao_aps_lock_set(
  p_operacao_id uuid,
  p_locked boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  UPDATE public.industria_producao_operacoes
  SET aps_locked = COALESCE(p_locked, false),
      aps_lock_reason = CASE WHEN COALESCE(p_locked, false) THEN COALESCE(p_reason, aps_lock_reason) ELSE NULL END,
      aps_locked_at = CASE WHEN COALESCE(p_locked, false) THEN now() ELSE NULL END,
      aps_locked_by = CASE WHEN COALESCE(p_locked, false) THEN auth.uid() ELSE NULL END,
      updated_at = now()
  WHERE id = p_operacao_id
    AND empresa_id = v_empresa_id;
END;
$$;

-- 5) Atualiza preview detalhado para incluir lock/freeze (sem alterar assinatura do front)
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
  scheduled boolean
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
      op.aps_locked
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
    -- Respeita lock e freeze: não mexe no que está dentro do horizonte congelado
    IF rec.aps_locked OR rec.effective_day <= v_freeze_until THEN
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
      RETURN QUERY SELECT
        rec.operacao_id,
        rec.ordem_id,
        rec.ordem_numero,
        rec.produto_nome,
        rec.old_ini,
        rec.old_fim,
        NULL::date,
        NULL::date,
        false;
    ELSE
      IF rec.old_ini IS DISTINCT FROM v_start OR rec.old_fim IS DISTINCT FROM v_end THEN
        RETURN QUERY SELECT
          rec.operacao_id,
          rec.ordem_id,
          rec.ordem_numero,
          rec.produto_nome,
          rec.old_ini,
          rec.old_fim,
          v_start,
          v_end,
          true;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- 6) Atualiza sequenciador (apply) para respeitar freeze/lock (mantém assinatura)
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
  v_freeze_dias int := 0;
  v_freeze_until date := now()::date;
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

  CREATE TEMP TABLE tmp_changes (
    operacao_id uuid PRIMARY KEY,
    old_ini date NULL,
    old_fim date NULL,
    new_ini date NULL,
    new_fim date NULL
  ) ON COMMIT DROP;

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
      COALESCE(ord.prioridade, 0) AS prioridade,
      op.sequencia,
      op.created_at,
      (COALESCE(op.tempo_setup_min, 0) / 60.0)
        + (COALESCE(op.quantidade_planejada, 0) * COALESCE(op.tempo_ciclo_min_por_unidade, 0)) / 60.0 AS horas,
      op.data_prevista_inicio AS old_ini,
      op.data_prevista_fim AS old_fim,
      COALESCE(op.data_prevista_inicio, ord.data_prevista_inicio, ord.created_at::date, v_now) AS effective_day,
      op.aps_locked
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

    IF rec.aps_locked OR rec.effective_day <= v_freeze_until THEN
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
      jsonb_build_object('data_inicial', v_dt_ini, 'data_final', v_dt_fim, 'freeze_dias', COALESCE(v_freeze_dias, 0)),
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
    'freeze_dias', COALESCE(v_freeze_dias, 0),
    'total_operacoes', v_total,
    'updated_operacoes', v_changed,
    'unscheduled_operacoes', v_unscheduled
  );
END;
$$;

-- 7) Replan overload respeita freeze/lock (mantém assinatura)
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
  v_freeze_dias int := 0;
  v_freeze_until date := now()::date;
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
      op.data_prevista_fim AS old_fim,
      op.aps_locked
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
    IF rec.aps_locked OR rec.horas IS NULL OR rec.horas <= 0.0001 THEN
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
      jsonb_build_object('peak_day', p_dia, 'data_final', v_end, 'freeze_dias', COALESCE(v_freeze_dias, 0)),
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
    'end_day', v_end,
    'freeze_until', v_freeze_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_ct_aps_config_get(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industria_ct_aps_config_upsert(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industria_operacao_aps_lock_set(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_preview_sequenciar_ct(uuid, date, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_sequenciar_ct(uuid, date, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_replanejar_ct_sobrecarga(uuid, date, date) TO authenticated, service_role;

COMMIT;
