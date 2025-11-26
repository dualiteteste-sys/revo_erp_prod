-- 2025-11-26: Drop redundant/duplicate indexes (safe, idempotent)
-- Context: Composite PK/UNIQUE already cover leftmost-prefix queries. Non-unique single-column indexes below are redundant.
-- Notes:
-- - Uses DROP INDEX CONCURRENTLY to avoid long locks. Requires running outside a transaction.
-- - Safe to re-run (IF EXISTS).
-- - Review on staging before production.

-- Recommended psql invocation:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ./supabase/migrations/20251126_drop_redundant_indexes_part2.sql

SET lock_timeout = '5s';
SET statement_timeout = '10min';
SET idle_in_transaction_session_timeout = '10min';
SET client_min_messages = warning;

-- produto_componentes: PK (kit_id, componente_id) covers (kit_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_componentes_kit_id_368428;

-- produto_fornecedores: PK (produto_id, fornecedor_id) covers (produto_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_fornecedores_produto_id_097c13;

-- produto_tags: PK (produto_id, tag_id) covers (produto_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_tags_produto_id_20440a;

-- role_permissions: PK (role_id, permission_id) covers (role_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fk_role_permissions_role_id_4d1d2c;

-- subscriptions: UNIQUE on (stripe_subscription_id) makes extra non-unique idx redundant
DROP INDEX CONCURRENTLY IF EXISTS public.subscriptions_stripe_subscription_id_idx;

-- user_permission_overrides: PK (empresa_id, user_id, permission_id) covers (empresa_id, user_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_upo__empresa_user;

-- EOF
