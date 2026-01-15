/*
  OPS-403 (v2): enriquecer eventos 403 para triagem
  - classification (kind)
  - plano_mvp + role (context)
  - flags de auto-recover (attempted/ok)

  Mantém compatibilidade:
  - mantém ops_403_events_log v1
  - adiciona ops_403_events_log_v2 e estende list/count
*/

BEGIN;

ALTER TABLE IF EXISTS public.ops_403_events
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS plano_mvp text NULL,
  ADD COLUMN IF NOT EXISTS role text NULL,
  ADD COLUMN IF NOT EXISTS recovery_attempted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_ok boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ops_403_events_empresa_created_at
  ON public.ops_403_events (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_403_events_kind
  ON public.ops_403_events (kind);

-- -----------------------------------------------------------------------------
-- RPC: log v2 (best-effort, sem depender de empresa ativa explícita)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_403_events_log_v2(text, text, text, text, text, text, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.ops_403_events_log_v2(
  p_rpc_fn text,
  p_route text,
  p_request_id text,
  p_code text,
  p_message text,
  p_details text,
  p_kind text,
  p_recovery_attempted boolean DEFAULT false,
  p_recovery_ok boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_role text;
  v_plano_mvp text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
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

    SELECT ent.plano_mvp
      INTO v_plano_mvp
      FROM public.empresa_entitlements ent
     WHERE ent.empresa_id = v_empresa_id
     LIMIT 1;
  END IF;

  INSERT INTO public.ops_403_events (
    empresa_id,
    user_id,
    request_id,
    route,
    rpc_fn,
    http_status,
    code,
    message,
    details,
    kind,
    plano_mvp,
    role,
    recovery_attempted,
    recovery_ok
  ) VALUES (
    v_empresa_id,
    v_user_id,
    NULLIF(p_request_id,''),
    NULLIF(p_route,''),
    NULLIF(p_rpc_fn,''),
    403,
    NULLIF(p_code,''),
    COALESCE(NULLIF(p_message,''), 'HTTP_403'),
    NULLIF(p_details,''),
    COALESCE(NULLIF(p_kind,''), 'unknown'),
    NULLIF(v_plano_mvp,''),
    NULLIF(v_role,''),
    COALESCE(p_recovery_attempted, false),
    COALESCE(p_recovery_ok, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_log_v2(text,text,text,text,text,text,text,boolean,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_log_v2(text,text,text,text,text,text,text,boolean,boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Extend list/count to include v2 columns
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_403_events_list(int,int,boolean,text);
CREATE OR REPLACE FUNCTION public.ops_403_events_list(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_only_open boolean DEFAULT true,
  p_q text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  empresa_id uuid,
  user_id uuid,
  request_id text,
  route text,
  rpc_fn text,
  code text,
  message text,
  resolved boolean,
  kind text,
  plano_mvp text,
  role text,
  recovery_attempted boolean,
  recovery_ok boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN QUERY
  SELECT
    e.id,
    e.created_at,
    e.empresa_id,
    e.user_id,
    e.request_id,
    e.route,
    e.rpc_fn,
    e.code,
    e.message,
    e.resolved,
    e.kind,
    e.plano_mvp,
    e.role,
    e.recovery_attempted,
    e.recovery_ok
  FROM public.ops_403_events e
  WHERE e.empresa_id = public.current_empresa_id()
    AND (NOT p_only_open OR e.resolved = false)
    AND (
      p_q IS NULL OR btrim(p_q) = ''
      OR COALESCE(e.message,'') ILIKE '%'||p_q||'%'
      OR COALESCE(e.rpc_fn,'') ILIKE '%'||p_q||'%'
      OR COALESCE(e.route,'') ILIKE '%'||p_q||'%'
      OR COALESCE(e.request_id,'') ILIKE '%'||p_q||'%'
    )
  ORDER BY e.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_list(int,int,boolean,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_list(int,int,boolean,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_403_events_count(boolean,text);
CREATE OR REPLACE FUNCTION public.ops_403_events_count(
  p_only_open boolean DEFAULT true,
  p_q text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN (
    SELECT COUNT(*)
    FROM public.ops_403_events e
    WHERE e.empresa_id = public.current_empresa_id()
      AND (NOT p_only_open OR e.resolved = false)
      AND (
        p_q IS NULL OR btrim(p_q) = ''
        OR COALESCE(e.message,'') ILIKE '%'||p_q||'%'
        OR COALESCE(e.rpc_fn,'') ILIKE '%'||p_q||'%'
        OR COALESCE(e.route,'') ILIKE '%'||p_q||'%'
        OR COALESCE(e.request_id,'') ILIKE '%'||p_q||'%'
      )
  )::int;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_count(boolean,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_count(boolean,text) TO authenticated, service_role;

COMMIT;

