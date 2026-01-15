/*
  OPS: Backups por tenant (empresa) — catálogo para UI interna
  - Workflows (tenant-backup.yml / tenant-restore-from-r2.yml) inserem/atualizam linhas aqui via psql.
  - UI (Dev → Backup por Empresa) consome via RPC.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_tenant_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target in ('prod','dev','verify')),
  r2_bucket text NOT NULL,
  r2_key text NOT NULL UNIQUE,
  bytes bigint NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status in ('uploaded','failed','restored','deleted')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.ops_tenant_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_tenant_backups_select ON public.ops_tenant_backups;
CREATE POLICY ops_tenant_backups_select
  ON public.ops_tenant_backups
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ops','view')
  );

DROP POLICY IF EXISTS ops_tenant_backups_update ON public.ops_tenant_backups;
CREATE POLICY ops_tenant_backups_update
  ON public.ops_tenant_backups
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

GRANT SELECT, INSERT, UPDATE ON public.ops_tenant_backups TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS ops_tenant_backups_created_at_idx ON public.ops_tenant_backups (created_at DESC);
CREATE INDEX IF NOT EXISTS ops_tenant_backups_empresa_created_at_idx ON public.ops_tenant_backups (empresa_id, created_at DESC);

DROP FUNCTION IF EXISTS public.ops_tenant_backups_list(text, int, int);
CREATE OR REPLACE FUNCTION public.ops_tenant_backups_list(
  p_target text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  empresa_id uuid,
  target text,
  r2_bucket text,
  r2_key text,
  bytes bigint,
  sha256 text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.created_at,
    b.empresa_id,
    b.target,
    b.r2_bucket,
    b.r2_key,
    b.bytes,
    b.sha256,
    b.status
  FROM public.ops_tenant_backups b
  WHERE b.empresa_id = v_empresa_id
    AND (p_target IS NULL OR b.target = p_target)
  ORDER BY b.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_tenant_backups_list(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_tenant_backups_list(text, int, int) TO authenticated, service_role;

COMMIT;

