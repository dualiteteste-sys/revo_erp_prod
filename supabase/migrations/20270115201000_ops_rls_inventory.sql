/*
  OPS (P1.1): Inventário RLS para multi-tenant
  - Lista tabelas "public" com:
    - rls_enabled
    - tem coluna empresa_id?
    - possui alguma policy que referencia current_empresa_id()?
    - grants diretos para authenticated (select/insert/update/delete)
  - Acesso via RPC (ops:view) para UI interna.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.ops_rls_inventory_list(text, int, int);

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
  PERFORM public.require_permission_for_current_user('ops','view');

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
        position('current_empresa_id' in lower(coalesce(p.qual,''))) > 0
        OR position('current_empresa_id' in lower(coalesce(p.with_check,''))) > 0
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
    -- Prioridade: risco alto primeiro (grants + sem RLS)
    (CASE WHEN (g.grants_select OR g.grants_insert OR g.grants_update OR g.grants_delete) AND NOT t.rls_enabled THEN 0 ELSE 1 END),
    t.table_name
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_rls_inventory_list(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_rls_inventory_list(text, int, int) TO authenticated, service_role;

COMMIT;

