-- =============================================================================
-- IND-06: Relatórios essenciais (WIP / filas / qualidade)
-- - RPCs leves para cards de "Relatórios de Indústria"
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.industria_relatorio_wip(integer);
CREATE OR REPLACE FUNCTION public.industria_relatorio_wip(p_periodo_dias integer DEFAULT 30)
RETURNS TABLE (
  periodo_dias integer,
  ordens_wip integer,
  operacoes_na_fila integer,
  operacoes_em_execucao integer,
  operacoes_pausadas integer,
  operacoes_concluidas_periodo integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_ini timestamptz := now() - (COALESCE(p_periodo_dias, 30) || ' days')::interval;
BEGIN
  IF to_regclass('public.industria_producao_ordens') IS NULL OR to_regclass('public.industria_producao_operacoes') IS NULL THEN
    RETURN QUERY SELECT
      COALESCE(p_periodo_dias, 30)::integer,
      0, 0, 0, 0, 0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH o AS (
    SELECT count(*)::int AS ordens_wip
    FROM public.industria_producao_ordens
    WHERE empresa_id = v_empresa_id
      AND status NOT IN ('concluida', 'cancelada')
  ),
  ops AS (
    SELECT
      count(*) FILTER (WHERE op.status = 'na_fila')::int AS na_fila,
      count(*) FILTER (WHERE op.status = 'em_execucao')::int AS em_execucao,
      count(*) FILTER (WHERE op.status = 'pausada')::int AS pausadas,
      count(*) FILTER (WHERE op.status = 'concluida' AND op.data_fim_real IS NOT NULL AND op.data_fim_real >= v_ini)::int AS concluidas_periodo
    FROM public.industria_producao_operacoes op
    WHERE op.empresa_id = v_empresa_id
  )
  SELECT
    COALESCE(p_periodo_dias, 30)::integer,
    COALESCE(o.ordens_wip, 0),
    COALESCE(ops.na_fila, 0),
    COALESCE(ops.em_execucao, 0),
    COALESCE(ops.pausadas, 0),
    COALESCE(ops.concluidas_periodo, 0)
  FROM o, ops;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_relatorio_wip(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.industria_relatorio_wip(integer) TO authenticated, service_role;


DROP FUNCTION IF EXISTS public.qualidade_kpis(integer);
CREATE OR REPLACE FUNCTION public.qualidade_kpis(p_periodo_dias integer DEFAULT 30)
RETURNS TABLE (
  periodo_dias integer,
  lotes_total integer,
  lotes_aprovados integer,
  lotes_em_analise integer,
  lotes_bloqueados integer,
  lotes_reprovados integer,
  saldo_bloqueado numeric,
  inspecoes_periodo integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_ini timestamptz := now() - (COALESCE(p_periodo_dias, 30) || ' days')::interval;
BEGIN
  IF to_regclass('public.estoque_lotes') IS NULL THEN
    RETURN QUERY SELECT COALESCE(p_periodo_dias, 30)::integer, 0, 0, 0, 0, 0, 0, 0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH l AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status_qa = 'aprovado')::int AS aprovados,
      count(*) FILTER (WHERE status_qa = 'em_analise')::int AS em_analise,
      count(*) FILTER (WHERE status_qa = 'bloqueado')::int AS bloqueados,
      count(*) FILTER (WHERE status_qa = 'reprovado')::int AS reprovados,
      COALESCE(sum(CASE WHEN status_qa IS DISTINCT FROM 'aprovado' THEN COALESCE(saldo, 0) ELSE 0 END), 0) AS saldo_bloqueado
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id
  ),
  i AS (
    SELECT
      CASE
        WHEN to_regclass('public.industria_qualidade_inspecoes') IS NULL THEN 0
        ELSE (
          SELECT count(*)::int
          FROM public.industria_qualidade_inspecoes
          WHERE empresa_id = v_empresa_id
            AND created_at >= v_ini
        )
      END AS inspecoes_periodo
  )
  SELECT
    COALESCE(p_periodo_dias, 30)::integer,
    COALESCE(l.total, 0),
    COALESCE(l.aprovados, 0),
    COALESCE(l.em_analise, 0),
    COALESCE(l.bloqueados, 0),
    COALESCE(l.reprovados, 0),
    COALESCE(l.saldo_bloqueado, 0),
    COALESCE(i.inspecoes_periodo, 0)
  FROM l, i;
END;
$$;

REVOKE ALL ON FUNCTION public.qualidade_kpis(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.qualidade_kpis(integer) TO authenticated, service_role;

-- Força reload do schema cache do PostgREST (evita 404 em /rpc após migração)
NOTIFY pgrst, 'reload schema';

COMMIT;

