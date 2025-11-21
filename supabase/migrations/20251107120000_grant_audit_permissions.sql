-- =============================================================================
-- Migração: Conceder permissões de leitura no schema de auditoria
-- Data: 2025-11-07
-- Objetivo: Permitir que a role 'authenticated' leia a tabela audit.events.
-- =============================================================================

-- 1) Concede permissão de uso no schema 'audit'
GRANT USAGE ON SCHEMA audit TO authenticated, service_role;

-- 2) Concede permissão de SELECT na tabela 'audit.events' (RLS cuidará da filtragem)
GRANT SELECT ON TABLE audit.events TO authenticated, service_role;

-- 3) Notifica o PostgREST para recarregar o schema e aplicar as novas permissões
SELECT pg_notify('pgrst','reload schema');
