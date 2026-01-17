/*
  OPS (P1.1): Bypass seguro para "system actors" em utilitários ops (inventário/snapshots RLS)

  Problema
  - As RPCs do inventário RLS exigem `ops:view/ops:manage` e dependem de contexto JWT (`auth.uid()`).
  - Em execuções automatizadas via `psql` (ex.: GitHub Actions usando SUPABASE_DB_URL_*),
    não há JWT → `require_permission_for_current_user(...)` falha, impedindo gerar snapshots DEV/PROD.

  Solução (estado da arte)
  - Permitir executar essas RPCs em contexto "system" APENAS quando:
    - for service_role (JWT role = service_role) OU
    - for uma sessão de banco direta (psql) logada como `postgres`/`supabase_admin`.
  - Mantém enforcement normal para usuários finais (authenticated) via RBAC ops.
  - Não expõe tabelas diretamente ao client; apenas ajuste no gate das RPCs SECURITY DEFINER.
*/

BEGIN;

-- Helper: "system actor" (confiável) para automações/CI.
-- Importante: usar `session_user` (não `current_user`) porque as RPCs são SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.is_system_actor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.is_service_role()
    OR session_user IN ('postgres', 'supabase_admin');
$$;

REVOKE ALL ON FUNCTION public.is_system_actor() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_system_actor() TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- Inventário RLS (heurísticas atuais) — mantém enforcement para user final.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ops_rls_inventory_list(
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  schema_name text,
  table_name text,
  rls_enabled boolean,
  has_empresa_id boolean,
  has_current_empresa_policy boolean,
  policies_count int,
  grants_select boolean,
  grants_insert boolean,
  grants_update boolean,
  grants_delete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_system_actor() THEN
    PERFORM public.require_permission_for_current_user('ops','view');
  END IF;

  RETURN QUERY
  WITH tables AS (
    SELECT
      n.nspname::text AS schema_name,
      c.relname::text AS table_name,
      c.oid AS table_oid,
      c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
  ),
  cols AS (
    SELECT
      t.schema_name,
      t.table_name,
      EXISTS (
        SELECT 1
        FROM information_schema.columns ic
        WHERE ic.table_schema = t.schema_name
          AND ic.table_name = t.table_name
          AND ic.column_name = 'empresa_id'
      ) AS has_empresa_id
    FROM tables t
  ),
  pol AS (
    SELECT
      t.schema_name,
      t.table_name,
      COUNT(p.*)::int AS policies_count,
      BOOL_OR(
        -- Heurística 1: filtro explícito pelo contexto (empresa ativa)
        position('current_empresa_id' in lower(coalesce(p.qual,''))) > 0
        OR position('current_empresa_id' in lower(coalesce(p.with_check,''))) > 0
        -- Heurística 2: filtro por membership (seguro, mas não necessariamente "empresa ativa")
        OR (
          position('empresa_usuarios' in lower(coalesce(p.qual,''))) > 0
          AND position('auth.uid' in lower(coalesce(p.qual,''))) > 0
        )
        OR (
          position('empresa_usuarios' in lower(coalesce(p.with_check,''))) > 0
          AND position('auth.uid' in lower(coalesce(p.with_check,''))) > 0
        )
      ) AS has_current_empresa_policy
    FROM tables t
    LEFT JOIN pg_policies p
      ON p.schemaname = t.schema_name
     AND p.tablename = t.table_name
    GROUP BY t.schema_name, t.table_name
  ),
  grants AS (
    SELECT
      t.schema_name,
      t.table_name,
      COALESCE(bool_or(privilege_type = 'SELECT'), false) AS grants_select,
      COALESCE(bool_or(privilege_type = 'INSERT'), false) AS grants_insert,
      COALESCE(bool_or(privilege_type = 'UPDATE'), false) AS grants_update,
      COALESCE(bool_or(privilege_type = 'DELETE'), false) AS grants_delete
    FROM tables t
    LEFT JOIN information_schema.role_table_grants g
      ON g.table_schema = t.schema_name
     AND g.table_name = t.table_name
     AND g.grantee = 'authenticated'
    GROUP BY t.schema_name, t.table_name
  )
  SELECT
    t.schema_name,
    t.table_name,
    t.rls_enabled,
    c.has_empresa_id,
    p.has_current_empresa_policy,
    p.policies_count,
    g.grants_select,
    g.grants_insert,
    g.grants_update,
    g.grants_delete
  FROM tables t
  JOIN cols c USING (schema_name, table_name)
  JOIN pol p USING (schema_name, table_name)
  JOIN grants g USING (schema_name, table_name)
  WHERE p_q IS NULL OR btrim(p_q) = '' OR t.table_name ILIKE '%'||p_q||'%'
  ORDER BY
    (CASE WHEN (g.grants_select OR g.grants_insert OR g.grants_update OR g.grants_delete) AND NOT t.rls_enabled THEN 0 ELSE 1 END),
    t.table_name
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_rls_inventory_list(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_rls_inventory_list(text, int, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Snapshots do inventário (list/get/create) — mantém enforcement para user final.
-- ---------------------------------------------------------------------------
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
  IF NOT public.is_system_actor() THEN
    PERFORM public.require_permission_for_current_user('ops','view');
  END IF;

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
  IF NOT public.is_system_actor() THEN
    PERFORM public.require_permission_for_current_user('ops','view');
  END IF;

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
  IF NOT public.is_system_actor() THEN
    PERFORM public.require_permission_for_current_user('ops','manage');
  END IF;

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

