-- =============================================================================
-- OPS: eventos 403 (empresa ativa / multi-tenant) + tela interna de diagnóstico
-- - Armazena 403 (42501) com request_id, rota e RPC
-- - Permite triagem (resolved) e listagem por admin/owner via perm ops:view
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_403_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid NULL REFERENCES public.empresas(id) ON DELETE SET NULL,
  user_id uuid NULL,
  request_id text NULL,
  route text NULL,
  rpc_fn text NULL,
  http_status int NOT NULL DEFAULT 403,
  code text NULL,
  message text NOT NULL,
  details text NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL
);

ALTER TABLE public.ops_403_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_403_events_select ON public.ops_403_events;
CREATE POLICY ops_403_events_select
  ON public.ops_403_events
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ops','view')
  );

DROP POLICY IF EXISTS ops_403_events_update ON public.ops_403_events;
CREATE POLICY ops_403_events_update
  ON public.ops_403_events
  FOR UPDATE
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ops','manage')
  )
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ops','manage')
  );

GRANT SELECT, INSERT, UPDATE ON public.ops_403_events TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: log (best-effort, sem depender de empresa ativa explícita)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_403_events_log(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.ops_403_events_log(
  p_rpc_fn text,
  p_route text,
  p_request_id text,
  p_code text,
  p_message text,
  p_details text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_empresa_id IS NULL THEN
    v_empresa_id := public.get_preferred_empresa_for_user(v_user_id);
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
    details
  ) VALUES (
    v_empresa_id,
    v_user_id,
    NULLIF(p_request_id,''),
    NULLIF(p_route,''),
    NULLIF(p_rpc_fn,''),
    403,
    NULLIF(p_code,''),
    COALESCE(NULLIF(p_message,''), 'HTTP_403'),
    NULLIF(p_details,'')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_log(text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_log(text,text,text,text,text,text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: list/count (para UI interna)
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
  resolved boolean
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
    e.resolved
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

-- -----------------------------------------------------------------------------
-- RPC: resolver / reabrir
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_403_events_set_resolved(uuid,boolean);
CREATE OR REPLACE FUNCTION public.ops_403_events_set_resolved(
  p_id uuid,
  p_resolved boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := public.current_user_id();
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');

  UPDATE public.ops_403_events e
     SET resolved = COALESCE(p_resolved, true),
         resolved_at = CASE WHEN COALESCE(p_resolved, true) THEN now() ELSE NULL END,
         resolved_by = CASE WHEN COALESCE(p_resolved, true) THEN v_user_id ELSE NULL END
   WHERE e.id = p_id
     AND e.empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_set_resolved(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_set_resolved(uuid,boolean) TO authenticated, service_role;

COMMIT;

