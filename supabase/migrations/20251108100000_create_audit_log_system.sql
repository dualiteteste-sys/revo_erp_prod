-- =============================================================================
-- Migração: Criar sistema de logs de auditoria (audit.events)
-- Data: 2025-11-08
-- =============================================================================

-- 1) Criar o schema de auditoria
CREATE SCHEMA IF NOT EXISTS audit;

-- 2) Criar a tabela de eventos
CREATE TABLE IF NOT EXISTS audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  table_name text,
  op text CHECK (op IN ('INSERT','UPDATE','DELETE','SELECT')),
  actor_id uuid,
  actor_email text,
  pk jsonb,
  row_old jsonb,
  row_new jsonb,
  diff jsonb,
  meta jsonb
);

COMMENT ON TABLE audit.events IS 'Registros de eventos de auditoria do sistema.';

-- 3) Criar índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit.events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_empresa_id ON audit.events (empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_source ON audit.events (source);
CREATE INDEX IF NOT EXISTS idx_audit_events_table_name ON audit.events (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_events_op ON audit.events (op);

-- 4) Habilitar RLS e criar política de acesso
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select_policy ON audit.events;
CREATE POLICY audit_events_select_policy
  ON audit.events
  FOR SELECT
  TO authenticated
  USING (empresa_id IS NULL OR empresa_id = public.current_empresa_id());

-- 5) Criar a função RPC principal no schema 'audit'
CREATE OR REPLACE FUNCTION audit.list_events_for_current_user(
  p_from timestamptz DEFAULT now() - '30 days'::interval,
  p_to timestamptz DEFAULT now(),
  p_source text[] DEFAULT NULL,
  p_table text[] DEFAULT NULL,
  p_op text[] DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS SETOF audit.events
LANGUAGE sql
SECURITY INVOKER
SET search_path = 'pg_catalog', 'public'
AS $$
  SELECT *
  FROM audit.events
  WHERE
    -- Filtro de empresa é aplicado pela RLS
    occurred_at >= p_from AND occurred_at <= p_to
    AND (p_after IS NULL OR occurred_at < p_after)
    AND (p_source IS NULL OR source = ANY(p_source))
    AND (p_table IS NULL OR table_name = ANY(p_table))
    AND (p_op IS NULL OR op = ANY(p_op))
    AND (
      p_q IS NULL OR (
        coalesce(pk::text, '') ||
        coalesce(row_old::text, '') ||
        coalesce(row_new::text, '') ||
        coalesce(diff::text, '') ||
        coalesce(meta::text, '')
      ) ILIKE '%' || p_q || '%'
    )
  ORDER BY occurred_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

-- 6) Aplicar permissões na função principal
REVOKE ALL ON FUNCTION audit.list_events_for_current_user(timestamptz, timestamptz, text[], text[], text[], text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.list_events_for_current_user(timestamptz, timestamptz, text[], text[], text[], text, timestamptz, int) TO authenticated, service_role;

-- 7) Criar a função wrapper no schema 'public'
CREATE OR REPLACE FUNCTION public.list_events_for_current_user(
  p_from timestamptz DEFAULT now() - '30 days'::interval,
  p_to timestamptz DEFAULT now(),
  p_source text[] DEFAULT NULL,
  p_table text[] DEFAULT NULL,
  p_op text[] DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_after timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS SETOF audit.events
LANGUAGE sql
SECURITY INVOKER
SET search_path = 'pg_catalog', 'public'
AS $$
  SELECT *
  FROM audit.list_events_for_current_user(
    p_from, p_to, p_source, p_table, p_op, p_q, p_after, p_limit
  );
$$;

-- 8) Aplicar permissões na função wrapper
REVOKE ALL ON FUNCTION public.list_events_for_current_user(timestamptz, timestamptz, text[], text[], text[], text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_events_for_current_user(timestamptz, timestamptz, text[], text[], text[], text, timestamptz, int) TO authenticated, service_role;

-- 9) Notificar o PostgREST para recarregar o schema cache
SELECT pg_notify('pgrst', 'reload schema');
