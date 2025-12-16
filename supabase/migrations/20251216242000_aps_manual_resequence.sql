-- =============================================================================
-- APS v1.7: sequenciamento manual (drag-and-drop) por CT com log + undo
-- - Permite reordenar operações ajustando "sequencia"
-- - Loga em pcp_aps_runs(kind='manual_resequence') e pcp_aps_run_changes (old_seq/new_seq)
-- - Undo também restaura sequencia quando aplicável
-- =============================================================================

BEGIN;

-- 1) Permite novo kind no log de runs
ALTER TABLE public.pcp_aps_runs
  DROP CONSTRAINT IF EXISTS pcp_aps_runs_kind_check;

ALTER TABLE public.pcp_aps_runs
  ADD CONSTRAINT pcp_aps_runs_kind_check
  CHECK (kind IN ('sequencing', 'replan_overload', 'manual_resequence'));

-- 2) Extende tabela de mudanças para incluir sequencia
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pcp_aps_run_changes'
      AND column_name = 'old_seq'
  ) THEN
    ALTER TABLE public.pcp_aps_run_changes ADD COLUMN old_seq int;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pcp_aps_run_changes'
      AND column_name = 'new_seq'
  ) THEN
    ALTER TABLE public.pcp_aps_run_changes ADD COLUMN new_seq int;
  END IF;
END$$;

-- 3) Atualiza listagem de mudanças (inclui sequencia + lock)
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
  old_seq int,
  new_seq int,
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
    c.old_seq,
    c.new_seq,
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

-- 4) RPC: aplicar nova ordem de sequencia (incrementos de 10)
DROP FUNCTION IF EXISTS public.pcp_aps_resequenciar_ct(uuid, uuid[]);
CREATE OR REPLACE FUNCTION public.pcp_aps_resequenciar_ct(
  p_centro_id uuid,
  p_operacao_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_total int := COALESCE(array_length(p_operacao_ids, 1), 0);
  v_changed int := 0;
  v_run_id uuid;
BEGIN
  IF v_total = 0 THEN
    RETURN jsonb_build_object('run_id', NULL, 'total', 0, 'updated', 0);
  END IF;

  -- valida CT
  IF NOT EXISTS (
    SELECT 1
    FROM public.industria_centros_trabalho
    WHERE empresa_id = v_empresa_id AND id = p_centro_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Centro de trabalho não encontrado/ativo.';
  END IF;

  -- valida operações
  IF EXISTS (
    SELECT 1
    FROM unnest(p_operacao_ids) AS x(op_id)
    LEFT JOIN public.industria_producao_operacoes op ON op.id = x.op_id
    WHERE op.id IS NULL
      OR op.empresa_id <> v_empresa_id
      OR op.centro_trabalho_id <> p_centro_id
      OR op.data_inicio_real IS NOT NULL
      OR op.data_fim_real IS NOT NULL
      OR op.status IN ('em_execucao', 'concluida', 'cancelada')
  ) THEN
    RAISE EXCEPTION 'Lista contém operações inválidas (empresa/CT/status).';
  END IF;

  CREATE TEMP TABLE tmp_order (
    operacao_id uuid PRIMARY KEY,
    new_seq int NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_order (operacao_id, new_seq)
  SELECT op_id, (ROW_NUMBER() OVER () * 10)::int
  FROM unnest(p_operacao_ids) WITH ORDINALITY AS t(op_id, ord)
  ORDER BY ord;

  CREATE TEMP TABLE tmp_changes (
    operacao_id uuid PRIMARY KEY,
    old_seq int NULL,
    new_seq int NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_changes (operacao_id, old_seq, new_seq)
  SELECT op.id, op.sequencia, o.new_seq
  FROM public.industria_producao_operacoes op
  JOIN tmp_order o ON o.operacao_id = op.id
  WHERE op.empresa_id = v_empresa_id;

  UPDATE public.industria_producao_operacoes op
  SET sequencia = o.new_seq,
      updated_at = now()
  FROM tmp_order o
  WHERE op.id = o.operacao_id
    AND op.empresa_id = v_empresa_id
    AND op.sequencia IS DISTINCT FROM o.new_seq;

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  v_run_id := gen_random_uuid();
  INSERT INTO public.pcp_aps_runs (id, empresa_id, kind, centro_trabalho_id, created_by, params, summary)
  VALUES (
    v_run_id,
    v_empresa_id,
    'manual_resequence',
    p_centro_id,
    auth.uid(),
    jsonb_build_object('total', v_total),
    jsonb_build_object('updated', v_changed, 'total', v_total)
  );

  INSERT INTO public.pcp_aps_run_changes (run_id, empresa_id, operacao_id, old_seq, new_seq)
  SELECT v_run_id, v_empresa_id, operacao_id, old_seq, new_seq
  FROM tmp_changes
  WHERE old_seq IS DISTINCT FROM new_seq;

  RETURN jsonb_build_object('run_id', v_run_id, 'total', v_total, 'updated', v_changed);
END;
$$;

-- 5) Undo: também restaura sequencia quando presente (mantém segurança: só se ainda está no "new")
DROP FUNCTION IF EXISTS public.pcp_aps_undo(uuid);
CREATE OR REPLACE FUNCTION public.pcp_aps_undo(
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_restored int := 0;
  v_skipped int := 0;
  rec record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.pcp_aps_runs r
    WHERE r.id = p_run_id
      AND r.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Run não encontrado.';
  END IF;

  FOR rec IN
    SELECT
      c.operacao_id,
      c.old_ini, c.old_fim, c.new_ini, c.new_fim,
      c.old_seq, c.new_seq
    FROM public.pcp_aps_run_changes c
    WHERE c.run_id = p_run_id
      AND c.empresa_id = v_empresa_id
  LOOP
    -- Para datas: só desfaz se o "current" ainda bate com o "new"
    -- Para sequencia: só desfaz se a sequencia atual ainda bate com new_seq
    IF EXISTS (
      SELECT 1
      FROM public.industria_producao_operacoes op
      WHERE op.id = rec.operacao_id
        AND op.empresa_id = v_empresa_id
        AND (rec.new_ini IS NULL OR op.data_prevista_inicio IS NOT DISTINCT FROM rec.new_ini)
        AND (rec.new_fim IS NULL OR op.data_prevista_fim IS NOT DISTINCT FROM rec.new_fim)
        AND (rec.new_seq IS NULL OR op.sequencia IS NOT DISTINCT FROM rec.new_seq)
    ) THEN
      UPDATE public.industria_producao_operacoes op
      SET data_prevista_inicio = COALESCE(rec.old_ini, op.data_prevista_inicio),
          data_prevista_fim = COALESCE(rec.old_fim, op.data_prevista_fim),
          sequencia = COALESCE(rec.old_seq, op.sequencia),
          updated_at = now()
      WHERE op.id = rec.operacao_id
        AND op.empresa_id = v_empresa_id;

      v_restored := v_restored + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'restored', v_restored,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_aps_run_changes_list(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_resequenciar_ct(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pcp_aps_undo(uuid) TO authenticated, service_role;

COMMIT;

