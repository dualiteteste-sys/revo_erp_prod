-- =============================================================================
-- APS v1.8: sequenciamento em lote (todos os Centros de Trabalho) para um período
-- - Orquestra chamadas de pcp_aps_sequenciar_ct por CT
-- - Retorna resumo por CT (inclui freeze_dias) para UX de "1 clique"
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pcp_aps_sequenciar_todos_cts(date, date, boolean);
CREATE OR REPLACE FUNCTION public.pcp_aps_sequenciar_todos_cts(
  p_data_inicial date,
  p_data_final date,
  p_apply boolean DEFAULT true
)
RETURNS TABLE (
  centro_id uuid,
  centro_nome text,
  run_id uuid,
  freeze_dias int,
  total_operacoes int,
  updated_operacoes int,
  unscheduled_operacoes int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  rec record;
  res jsonb;
BEGIN
  IF COALESCE(p_data_final, now()::date) < COALESCE(p_data_inicial, now()::date) THEN
    RAISE EXCEPTION 'Data final deve ser >= data inicial.';
  END IF;

  FOR rec IN
    SELECT id, nome
    FROM public.industria_centros_trabalho
    WHERE empresa_id = v_empresa_id
      AND ativo = true
    ORDER BY nome
  LOOP
    res := public.pcp_aps_sequenciar_ct(rec.id, p_data_inicial, p_data_final, p_apply);
    RETURN QUERY
    SELECT
      rec.id AS centro_id,
      rec.nome AS centro_nome,
      NULLIF((res->>'run_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AS run_id,
      COALESCE((res->>'freeze_dias')::int, 0) AS freeze_dias,
      COALESCE((res->>'total_operacoes')::int, 0) AS total_operacoes,
      COALESCE((res->>'updated_operacoes')::int, 0) AS updated_operacoes,
      COALESCE((res->>'unscheduled_operacoes')::int, 0) AS unscheduled_operacoes;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pcp_aps_sequenciar_todos_cts(date, date, boolean) TO authenticated, service_role;

COMMIT;

