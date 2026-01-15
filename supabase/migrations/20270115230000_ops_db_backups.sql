/*
  OPS: Backups de banco (registros) — catálogo para UI interna
  - GitHub Actions (db-backup.yml) insere linhas aqui via psql após upload no R2.
  - UI (Dev → Backups) consome via RPC.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_db_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  target text NOT NULL CHECK (target in ('prod','dev','verify')),
  mode text NOT NULL CHECK (mode in ('full','schema-only')),
  r2_bucket text NOT NULL,
  r2_key text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  bytes bigint NOT NULL,
  git_sha text NULL,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status in ('uploaded','failed','restored','deleted')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.ops_db_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_db_backups_select ON public.ops_db_backups;
CREATE POLICY ops_db_backups_select
  ON public.ops_db_backups
  FOR SELECT
  TO authenticated
  USING (public.has_permission_for_current_user('ops','view'));

DROP POLICY IF EXISTS ops_db_backups_update ON public.ops_db_backups;
CREATE POLICY ops_db_backups_update
  ON public.ops_db_backups
  FOR UPDATE
  TO authenticated
  USING (public.has_permission_for_current_user('ops','manage'))
  WITH CHECK (public.has_permission_for_current_user('ops','manage'));

GRANT SELECT, INSERT, UPDATE ON public.ops_db_backups TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS ops_db_backups_created_at_idx ON public.ops_db_backups (created_at DESC);
CREATE INDEX IF NOT EXISTS ops_db_backups_target_created_at_idx ON public.ops_db_backups (target, created_at DESC);

DROP FUNCTION IF EXISTS public.ops_db_backups_list(text, int, int);
CREATE OR REPLACE FUNCTION public.ops_db_backups_list(
  p_target text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  target text,
  mode text,
  r2_bucket text,
  r2_key text,
  sha256 text,
  bytes bigint,
  git_sha text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN QUERY
  SELECT
    b.id,
    b.created_at,
    b.target,
    b.mode,
    b.r2_bucket,
    b.r2_key,
    b.sha256,
    b.bytes,
    b.git_sha,
    b.status
  FROM public.ops_db_backups b
  WHERE p_target IS NULL OR b.target = p_target
  ORDER BY b.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_db_backups_list(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_db_backups_list(text, int, int) TO authenticated, service_role;

COMMIT;

