
-- Migration: drop duplicate/overlapping secondary indexes (safe: no constraints)
-- Generated at: 2025-11-26T19:42:15
-- Notes:
-- - Uses DROP INDEX CONCURRENTLY (cannot run inside a transaction block).
-- - Keep list chosen from groups; only non-constraint duplicates are dropped.
-- - If some index no longer exists, IF EXISTS keeps it idempotent.
-- - You may run this file via psql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20251126_194215_drop_duplicate_indexes.sql

SET lock_timeout = '5s';
SET statement_timeout = '5min';
SET idle_in_transaction_session_timeout = '1min';
RESET search_path; -- schema-qualified names are used below

-- ===== START: DROP INDEXES (each top-level; no BEGIN/COMMIT) =====

DROP INDEX CONCURRENTLY IF EXISTS public.empresa_usuarios_empresa_user_uidx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_entregas_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_entregas_empresa_id_018121;
DROP INDEX CONCURRENTLY IF EXISTS public.industria_ordens_entregas_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_entregas_ordem_id_be12e3;
DROP INDEX CONCURRENTLY IF EXISTS public.industria_ordens_entregas_ordem_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.uq_os_empresa_numero;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_os_empresa_status_created;

DROP INDEX CONCURRENTLY IF EXISTS public.ix_pessoas_empresa_id_doc_unico_unique;
DROP INDEX CONCURRENTLY IF EXISTS public.ux_pessoas_empresa_doc;

DROP INDEX CONCURRENTLY IF EXISTS public.uq_produtos_empresa_sku_not_null;

DROP INDEX CONCURRENTLY IF EXISTS public.rh_cargo_competencias_competencia_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargo_competencias_empresa_id_8cc745;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_cargo_competencias_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargos_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargos_empresa_id_8ba47a;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_cargos_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaborador_competencias_competencia_id_844c68;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_colaborador_competencias_competencia_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colab_comp_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaborador_competencias_empresa_id_8e9583;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_colaborador_competencias_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_cargo;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_cargo_id_e60dd2;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_colaboradores_cargo_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_empresa_id_266393;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_colaboradores_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_user_id_2fa2e6;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_colaboradores_user_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_competencias_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_competencias_empresa_id_16bab2;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_competencias_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamento_participantes_colaborador_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamento_participantes_colaborador_id_2ba4e7;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamento_participantes_empresa_id_1c5605;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_treinamento_participantes_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamentos_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamentos_empresa_id_98b83a;
DROP INDEX CONCURRENTLY IF EXISTS public.rh_treinamentos_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_role_permissions__role;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_role_permissions_role_id_541695;
DROP INDEX CONCURRENTLY IF EXISTS public.role_permissions_role_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_servicos_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_servicos_empresa_id_c7e30e;
DROP INDEX CONCURRENTLY IF EXISTS public.servicos_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_subscriptions_empresa_id_91a1ff;
DROP INDEX CONCURRENTLY IF EXISTS public.subscriptions_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.tabelas_medidas_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.tags_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_transportadoras_empresa_id_973d96;
DROP INDEX CONCURRENTLY IF EXISTS public.transportadoras_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_empresa_id_0e09b6;
DROP INDEX CONCURRENTLY IF EXISTS public.user_active_empresa_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_user_id_82ca68;
DROP INDEX CONCURRENTLY IF EXISTS public.user_active_empresa_user_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_permission_overrides_empresa_id_29e8a8;
DROP INDEX CONCURRENTLY IF EXISTS public.user_permission_overrides_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_permission_overrides_permission_id_cf6391;
DROP INDEX CONCURRENTLY IF EXISTS public.user_permission_overrides_permission_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_vendas_itens_pedido_empresa_id_304f00;
DROP INDEX CONCURRENTLY IF EXISTS public.vendas_itens_pedido_empresa_id_idx;

DROP INDEX CONCURRENTLY IF EXISTS public.idx_vendas_pedidos_empresa_id_052422;
DROP INDEX CONCURRENTLY IF EXISTS public.vendas_pedidos_empresa_id_idx;

-- ===== END: DROP INDEXES =====
