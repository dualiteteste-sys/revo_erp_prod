/*
  OPS (P1.1): Refinar classificação "MÉDIO" nos snapshots de inventário RLS

  Problema:
  - A regra atual marca como "MÉDIO" qualquer tabela com `empresa_id` + RLS ON + sem policy tenant-safe,
    mesmo quando a tabela não tem grants para `authenticated` (service_role-only / interna).
  - Isso gera falsos-positivos e ruído operacional.

  Solução:
  - Considerar "MÉDIO" apenas quando existe algum grant de CRUD para `authenticated` (ou seja,
    o client poderia acessar a tabela diretamente), e ainda assim falta policy tenant-safe.
*/

BEGIN;

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
        -- Apenas se houver acesso direto via authenticated (evita falsos-positivos em tabelas internas/service_role-only)
        AND (i.grants_select OR i.grants_insert OR i.grants_update OR i.grants_delete)
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

REVOKE ALL ON FUNCTION public.ops_rls_inventory_snapshot_create(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_rls_inventory_snapshot_create(text, jsonb) TO authenticated, service_role;

COMMIT;

