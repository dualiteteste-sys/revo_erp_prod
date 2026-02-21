/*
  RBAC — Histórico auditável de overrides por usuário (empresa atual)

  Objetivo
  - Entregar trilha de auditoria específica para alterações de `user_permission_overrides`.
  - Não depender de `logs:view` para o próprio usuário.
  - Fail-closed por tenant (empresa ativa obrigatória) e autenticação obrigatória.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.user_permission_overrides_history_for_current_empresa(uuid, int);
CREATE OR REPLACE FUNCTION public.user_permission_overrides_history_for_current_empresa(
  p_user_id uuid,
  p_limit int DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  changed_at timestamptz,
  changed_by uuid,
  operation text,
  permission_id uuid,
  permission_module text,
  permission_action text,
  before_allow boolean,
  after_allow boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_actor uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'user_permission_overrides_history_for_current_empresa: not_authenticated' USING errcode='42501';
  END IF;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetro obrigatório: p_user_id.' USING errcode='22023';
  END IF;

  IF NOT public.is_user_member_of(v_empresa) THEN
    RAISE EXCEPTION 'Usuário sem vínculo com a empresa ativa.' USING errcode='42501';
  END IF;

  IF p_user_id <> v_actor THEN
    PERFORM public.require_permission_for_current_user('usuarios', 'manage');
  END IF;

  RETURN QUERY
  WITH scoped_logs AS (
    SELECT
      l.id,
      l.changed_at,
      l.changed_by,
      l.operation::text AS operation,
      COALESCE(l.new_data ->> 'permission_id', l.old_data ->> 'permission_id') AS permission_id_text,
      CASE
        WHEN jsonb_typeof(l.old_data -> 'allow') = 'boolean' THEN (l.old_data ->> 'allow')::boolean
        ELSE NULL
      END AS before_allow,
      CASE
        WHEN jsonb_typeof(l.new_data -> 'allow') = 'boolean' THEN (l.new_data ->> 'allow')::boolean
        ELSE NULL
      END AS after_allow
    FROM public.audit_logs l
    WHERE l.empresa_id = v_empresa
      AND l.table_name = 'user_permission_overrides'
      AND (
        l.new_data ->> 'user_id' = p_user_id::text
        OR l.old_data ->> 'user_id' = p_user_id::text
      )
    ORDER BY l.changed_at DESC
    LIMIT v_limit
  )
  SELECT
    s.id,
    s.changed_at,
    s.changed_by,
    s.operation,
    p.id AS permission_id,
    p.module AS permission_module,
    p.action AS permission_action,
    s.before_allow,
    s.after_allow
  FROM scoped_logs s
  LEFT JOIN public.permissions p
    ON p.id::text = s.permission_id_text
  ORDER BY s.changed_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.user_permission_overrides_history_for_current_empresa(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_permission_overrides_history_for_current_empresa(uuid, int) TO authenticated, service_role;

COMMIT;
