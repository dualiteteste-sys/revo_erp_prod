-- =============================================================================
-- OPS: Erros no Sistema (console/network) + tela interna para triagem
-- - Captura erros do frontend (console.error / window.error / unhandledrejection)
-- - Anexa (best-effort) o último Network->Response capturado
-- - Permite triagem (resolved) por usuários com perm ops:manage
-- - Listagem (ops:view)
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid NULL REFERENCES public.empresas(id) ON DELETE SET NULL,
  user_id uuid NULL,

  source text NOT NULL DEFAULT 'console.error',
  route text NULL,
  last_action text NULL,

  message text NOT NULL,
  stack text NULL,

  request_id text NULL,
  url text NULL,
  method text NULL,
  http_status int NULL,
  code text NULL,
  response_text text NULL,

  fingerprint text NULL,

  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL
);

ALTER TABLE public.ops_app_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_app_errors_select ON public.ops_app_errors;
CREATE POLICY ops_app_errors_select
  ON public.ops_app_errors
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ops','view')
  );

DROP POLICY IF EXISTS ops_app_errors_update ON public.ops_app_errors;
CREATE POLICY ops_app_errors_update
  ON public.ops_app_errors
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

GRANT SELECT, INSERT, UPDATE ON public.ops_app_errors TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_ops_app_errors_empresa_created_at
  ON public.ops_app_errors (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_app_errors_resolved_created_at
  ON public.ops_app_errors (resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_app_errors_fingerprint
  ON public.ops_app_errors (fingerprint);

-- -----------------------------------------------------------------------------
-- RPC: log (best-effort, sem depender de empresa ativa explícita)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text
);

CREATE OR REPLACE FUNCTION public.ops_app_errors_log_v1(
  p_source text,
  p_route text,
  p_last_action text,
  p_message text,
  p_stack text,
  p_request_id text,
  p_url text,
  p_method text,
  p_http_status int,
  p_code text,
  p_response_text text,
  p_fingerprint text
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

  INSERT INTO public.ops_app_errors (
    empresa_id,
    user_id,
    source,
    route,
    last_action,
    message,
    stack,
    request_id,
    url,
    method,
    http_status,
    code,
    response_text,
    fingerprint
  ) VALUES (
    v_empresa_id,
    v_user_id,
    COALESCE(NULLIF(p_source,''), 'console.error'),
    NULLIF(p_route,''),
    NULLIF(p_last_action,''),
    COALESCE(NULLIF(p_message,''), 'APP_ERROR'),
    NULLIF(p_stack,''),
    NULLIF(p_request_id,''),
    NULLIF(p_url,''),
    NULLIF(p_method,''),
    p_http_status,
    NULLIF(p_code,''),
    NULLIF(p_response_text,''),
    NULLIF(p_fingerprint,'')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_app_errors_log_v1(
  text, text, text, text, text, text, text, text, int, text, text, text
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: list/count (para UI interna)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_app_errors_list(int,int,boolean,text,text);
CREATE OR REPLACE FUNCTION public.ops_app_errors_list(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_only_open boolean DEFAULT true,
  p_q text DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  empresa_id uuid,
  user_id uuid,
  source text,
  route text,
  last_action text,
  message text,
  request_id text,
  url text,
  method text,
  http_status int,
  code text,
  response_text text,
  fingerprint text,
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
    e.source,
    e.route,
    e.last_action,
    e.message,
    e.request_id,
    e.url,
    e.method,
    e.http_status,
    e.code,
    e.response_text,
    e.fingerprint,
    e.resolved
  FROM public.ops_app_errors e
  WHERE e.empresa_id = public.current_empresa_id()
    AND (NOT p_only_open OR e.resolved = false)
    AND (p_source IS NULL OR btrim(p_source) = '' OR e.source = p_source)
    AND (
      p_q IS NULL OR btrim(p_q) = '' OR (
        e.message ILIKE '%' || p_q || '%'
        OR COALESCE(e.route,'') ILIKE '%' || p_q || '%'
        OR COALESCE(e.url,'') ILIKE '%' || p_q || '%'
        OR COALESCE(e.request_id,'') ILIKE '%' || p_q || '%'
        OR COALESCE(e.code,'') ILIKE '%' || p_q || '%'
        OR COALESCE(e.fingerprint,'') ILIKE '%' || p_q || '%'
      )
    )
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200))
  OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_app_errors_list(int,int,boolean,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_app_errors_list(int,int,boolean,text,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_app_errors_count(boolean,text,text);
CREATE OR REPLACE FUNCTION public.ops_app_errors_count(
  p_only_open boolean DEFAULT true,
  p_q text DEFAULT NULL,
  p_source text DEFAULT NULL
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
    FROM public.ops_app_errors e
    WHERE e.empresa_id = public.current_empresa_id()
      AND (NOT p_only_open OR e.resolved = false)
      AND (p_source IS NULL OR btrim(p_source) = '' OR e.source = p_source)
      AND (
        p_q IS NULL OR btrim(p_q) = '' OR (
          e.message ILIKE '%' || p_q || '%'
          OR COALESCE(e.route,'') ILIKE '%' || p_q || '%'
          OR COALESCE(e.url,'') ILIKE '%' || p_q || '%'
          OR COALESCE(e.request_id,'') ILIKE '%' || p_q || '%'
          OR COALESCE(e.code,'') ILIKE '%' || p_q || '%'
          OR COALESCE(e.fingerprint,'') ILIKE '%' || p_q || '%'
        )
      )
  )::int;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_app_errors_count(boolean,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_app_errors_count(boolean,text,text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: set resolved
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_app_errors_set_resolved(uuid,boolean);
CREATE OR REPLACE FUNCTION public.ops_app_errors_set_resolved(
  p_id uuid,
  p_resolved boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_permission_for_current_user('ops','manage') THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ops_app_errors e
     SET resolved = COALESCE(p_resolved, false),
         resolved_at = CASE WHEN COALESCE(p_resolved,false) THEN now() ELSE NULL END,
         resolved_by = CASE WHEN COALESCE(p_resolved,false) THEN public.current_user_id() ELSE NULL END
   WHERE e.id = p_id
     AND e.empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.ops_app_errors_set_resolved(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_app_errors_set_resolved(uuid,boolean) TO authenticated, service_role;

COMMIT;
