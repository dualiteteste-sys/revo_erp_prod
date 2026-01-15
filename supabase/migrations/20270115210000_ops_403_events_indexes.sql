/*
  OPS: Índices para observabilidade 403
  - Suporta queries por janela (created_at) e por tipo (kind) usadas em health checks e UI.
*/

BEGIN;

-- Tabela pode não existir em ambientes muito antigos; migrations main garantem.
DO $$
BEGIN
  IF to_regclass('public.ops_403_events') IS NULL THEN
    RAISE NOTICE 'ops_403_events não existe; pulando índices.';
    RETURN;
  END IF;

  EXECUTE 'CREATE INDEX IF NOT EXISTS ops_403_events_created_at_idx ON public.ops_403_events (created_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS ops_403_events_kind_created_at_idx ON public.ops_403_events (kind, created_at DESC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS ops_403_events_resolved_created_at_idx ON public.ops_403_events (resolved, created_at DESC)';
END$$;

COMMIT;

