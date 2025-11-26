-- Migration: drop redundant non-unique index on public.empresa_usuarios
-- Notes:
-- - Using CONCURRENTLY to avoid long exclusive locks.
-- - Must NOT be run inside an explicit transaction block.
-- - Idempotent via IF EXISTS.

DROP INDEX CONCURRENTLY IF EXISTS public.empresa_usuarios_is_principal_idx;
