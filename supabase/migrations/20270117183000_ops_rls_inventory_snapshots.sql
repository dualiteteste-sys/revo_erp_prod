/*
  OPS (P1.1): Snapshots do inventário RLS
  - Permite registrar "snapshots" do inventário RLS (dev/prod) para evidência e auditoria.
  - Acesso apenas via RPC (ops:view/ops:manage).
  - A tabela NÃO é exposta diretamente ao client (sem grants para authenticated).
*/

BEGIN;

-- Tabela de snapshots (evidência operacional)
CREATE TABLE IF NOT EXISTS public.ops_rls_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  label text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  high_count int NOT NULL DEFAULT 0,
  medium_count int NOT NULL DEFAULT 0,
  ok_count int NOT NULL DEFAULT 0
);

ALTER TABLE public.ops_rls_inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso direto para client (somente via RPC security definer).
REVOKE ALL ON TABLE public.ops_rls_inventory_snapshots FROM public, anon, authenticated;
GRANT ALL ON TABLE public.ops_rls_inventory_snapshots TO service_role;

-- Lista snapshots
DROP FUNCTION IF EXISTS public.ops_rls_inventory_snapshots_list(int, int);
CREATE OR REPLACE FUNCTION public.ops_rls_inventory_snapshots_list(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  created_by uuid,
  label text,
  meta jsonb,
  high_count int,
  medium_count int,
  ok_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN QUERY
  SELECT
    s.id,
    s.created_at,
    s.created_by,
    s.label,
    s.meta,
    s.high_count,
    s.medium_count,
    s.ok_count
  FROM public.ops_rls_inventory_snapshots s
  ORDER BY s.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- Busca snapshot completo (inclui rows)
DROP FUNCTION IF EXISTS public.ops_rls_inventory_snapshot_get(uuid);
CREATE OR REPLACE FUNCTION public.ops_rls_inventory_snapshot_get(p_id uuid)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  created_by uuid,
  label text,
  meta jsonb,
  rows jsonb,
  high_count int,
  medium_count int,
  ok_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN QUERY
  SELECT
    s.id,
    s.created_at,
    s.created_by,
    s.label,
    s.meta,
    s.rows,
    s.high_count,
    s.medium_count,
    s.ok_count
  FROM public.ops_rls_inventory_snapshots s
  WHERE s.id = p_id;
END;
$$;

-- Cria snapshot do inventário RLS atual
DROP FUNCTION IF EXISTS public.ops_rls_inventory_snapshot_create(text, jsonb);
CREATE OR REPLACE FUNCTION public.ops_rls_inventory_snapshot_create(
  p_label text DEFAULT NULL,
  p_meta jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows jsonb;
  v_high int;
  v_medium int;
  v_ok int;
  v_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');

  WITH inv AS (
    SELECT *
    FROM public.ops_rls_inventory_list(NULL, 5000, 0)
  ),
  classified AS (
    SELECT
      i.*,
      (
        (i.grants_select OR i.grants_insert OR i.grants_update OR i.grants_delete)
        AND NOT i.rls_enabled
      ) AS is_high,
      (
        NOT (
          (i.grants_select OR i.grants_insert OR i.grants_update OR i.grants_delete)
          AND NOT i.rls_enabled
        )
        AND i.has_empresa_id
        AND i.rls_enabled
        AND NOT i.has_current_empresa_policy
      ) AS is_medium
    FROM inv i
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'schema_name', schema_name,
          'table_name', table_name,
          'rls_enabled', rls_enabled,
          'has_empresa_id', has_empresa_id,
          'has_current_empresa_policy', has_current_empresa_policy,
          'policies_count', policies_count,
          'grants_select', grants_select,
          'grants_insert', grants_insert,
          'grants_update', grants_update,
          'grants_delete', grants_delete,
          'risk', CASE WHEN is_high THEN 'high' WHEN is_medium THEN 'medium' ELSE 'ok' END
        )
        ORDER BY
          CASE WHEN is_high THEN 0 WHEN is_medium THEN 1 ELSE 2 END,
          table_name
      ),
      '[]'::jsonb
    ) AS rows_jsonb,
    COALESCE(sum(CASE WHEN is_high THEN 1 ELSE 0 END), 0)::int AS high_count,
    COALESCE(sum(CASE WHEN is_medium THEN 1 ELSE 0 END), 0)::int AS medium_count,
    COALESCE(sum(CASE WHEN (NOT is_high AND NOT is_medium) THEN 1 ELSE 0 END), 0)::int AS ok_count
  INTO v_rows, v_high, v_medium, v_ok
  FROM classified;

  INSERT INTO public.ops_rls_inventory_snapshots(label, meta, rows, high_count, medium_count, ok_count)
  VALUES (
    NULLIF(btrim(COALESCE(p_label, '')), ''),
    COALESCE(p_meta, '{}'::jsonb),
    v_rows,
    v_high,
    v_medium,
    v_ok
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_rls_inventory_snapshots_list(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_rls_inventory_snapshots_list(int, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ops_rls_inventory_snapshot_get(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_rls_inventory_snapshot_get(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ops_rls_inventory_snapshot_create(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_rls_inventory_snapshot_create(text, jsonb) TO authenticated, service_role;

COMMIT;

