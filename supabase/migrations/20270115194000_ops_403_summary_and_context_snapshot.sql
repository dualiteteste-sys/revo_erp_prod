/*
  OPS observability (403):
  - RPCs de resumo (top por tipo e por RPC) para triagem rápida na UI interna.
  - RPC "ops_context_snapshot" (user/empresa/role/plano) para debug reprodutível.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Context snapshot (debug rápido)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_context_snapshot();

CREATE OR REPLACE FUNCTION public.ops_context_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_role text;
  v_plano_mvp text;
  v_max_users int;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  IF v_empresa_id IS NULL THEN
    v_empresa_id := public.get_preferred_empresa_for_user(v_user_id);
  END IF;

  IF v_empresa_id IS NOT NULL THEN
    SELECT eu.role
      INTO v_role
      FROM public.empresa_usuarios eu
     WHERE eu.user_id = v_user_id
       AND eu.empresa_id = v_empresa_id
     ORDER BY eu.created_at DESC
     LIMIT 1;

    SELECT ent.plano_mvp, ent.max_users
      INTO v_plano_mvp, v_max_users
      FROM public.empresa_entitlements ent
     WHERE ent.empresa_id = v_empresa_id
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'at', now(),
    'user_id', v_user_id,
    'empresa_id', v_empresa_id,
    'role', v_role,
    'plano_mvp', v_plano_mvp,
    'max_users', v_max_users
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_context_snapshot() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_context_snapshot() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Resumo: top por kind
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_403_events_top_kind(int, boolean);

CREATE OR REPLACE FUNCTION public.ops_403_events_top_kind(
  p_limit int DEFAULT 8,
  p_only_open boolean DEFAULT true
)
RETURNS TABLE(
  kind text,
  total int,
  last_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN QUERY
  SELECT
    COALESCE(e.kind, 'unknown') AS kind,
    COUNT(*)::int AS total,
    MAX(e.created_at) AS last_at
  FROM public.ops_403_events e
  WHERE e.empresa_id = public.current_empresa_id()
    AND (NOT p_only_open OR e.resolved = false)
  GROUP BY COALESCE(e.kind, 'unknown')
  ORDER BY total DESC, last_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_top_kind(int, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_top_kind(int, boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Resumo: top RPCs
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_403_events_top_rpc(int, boolean);

CREATE OR REPLACE FUNCTION public.ops_403_events_top_rpc(
  p_limit int DEFAULT 12,
  p_only_open boolean DEFAULT true
)
RETURNS TABLE(
  rpc_fn text,
  total int,
  last_at timestamptz,
  kinds jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN QUERY
  WITH base AS (
    SELECT e.rpc_fn, COALESCE(e.kind,'unknown') AS kind, e.created_at
    FROM public.ops_403_events e
    WHERE e.empresa_id = public.current_empresa_id()
      AND (NOT p_only_open OR e.resolved = false)
      AND e.rpc_fn IS NOT NULL
  ),
  agg AS (
    SELECT
      b.rpc_fn,
      COUNT(*)::int AS total,
      MAX(b.created_at) AS last_at
    FROM base b
    GROUP BY b.rpc_fn
  )
  SELECT
    a.rpc_fn,
    a.total,
    a.last_at,
    (
      SELECT jsonb_object_agg(x.kind, x.cnt)
      FROM (
        SELECT b.kind, COUNT(*)::int AS cnt
        FROM base b
        WHERE b.rpc_fn = a.rpc_fn
        GROUP BY b.kind
      ) x
    ) AS kinds
  FROM agg a
  ORDER BY a.total DESC, a.last_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_top_rpc(int, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_top_rpc(int, boolean) TO authenticated, service_role;

COMMIT;

