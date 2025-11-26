-- migration: drop duplicated index on public.empresa_usuarios (empresa_id,user_id)
-- tags: [indexes, safety, idempotent]
-- requires: none
-- created_at: 2025-11-26

-- Segurança: evitar travas longas em tabelas quentes
SET lock_timeout = '2s';
SET statement_timeout = '5min';

-- search_path fixo
SET search_path = pg_catalog, public;

-- Observação:
-- Mantemos a PK (empresa_id, user_id). Esta migration apenas remove o índice único redundante
-- que pode existir em ambientes antigos: public.empresa_usuarios_empresa_user_uidx.
-- Idempotente: usa IF EXISTS + CONCURRENTLY.

DO $$
BEGIN
  -- Drop do índice redundante, se ainda existir
  EXECUTE 'DROP INDEX CONCURRENTLY IF EXISTS public.empresa_usuarios_empresa_user_uidx';
EXCEPTION
  WHEN feature_not_supported THEN
    -- Em alguns ambientes (transação aberta), o CONCURRENTLY pode falhar.
    -- Nesses casos, tentamos o drop normal como fallback fora de transação.
    RAISE NOTICE '[MIGRATION] CONCURRENTLY não suportado no contexto atual; tente executar fora de uma transação.';
END$$;

-- (Opcional) Verificação pós-execução (apenas para referência; execute manualmente se desejar):
-- SELECT i.relname, x.indisunique, pg_get_indexdef(i.oid)
-- FROM pg_index x
-- JOIN pg_class i ON i.oid = x.indexrelid
-- JOIN pg_class t ON t.oid = x.indrelid
-- JOIN pg_namespace n ON n.oid = t.relnamespace
-- WHERE n.nspname='public' AND t.relname='empresa_usuarios'
-- ORDER BY x.indisprimary DESC, x.indisunique DESC, i.relname;
