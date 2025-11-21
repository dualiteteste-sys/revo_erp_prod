-- =============================================================================
-- Migração: Hardening de Schemas e Default Privileges
-- Data: 2025-11-07
-- Objetivo:
--   1) Impedir criação de objetos por roles genéricas nos schemas expostos.
--   2) Ajustar Default Privileges para que novos objetos NÃO herdem EXECUTE para PUBLIC.
--   3) Garantir que authenticated/service_role continuem com o necessário.
-- Observação:
--   - Em Supabase, migrações rodam como "postgres" (owner). Default privileges
--     afetam objetos criados futuramente por esse owner.
-- =============================================================================

-- 1) REVOKE CREATE nos schemas expostos ao PostgREST
DO $$
DECLARE
  r_schema text;
BEGIN
  FOR r_schema IN SELECT unnest(ARRAY['public','storage']) LOOP
    -- Remover CREATE do schema para PUBLIC e authenticated (idempotente).
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM PUBLIC', r_schema);
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM authenticated', r_schema);

    -- Manter criação apenas para donos/operadores (postgres, service_role).
    -- (Grant é idempotente; se já tiver, permanece)
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated, service_role', r_schema);
    EXECUTE format('GRANT CREATE ON SCHEMA %I TO postgres', r_schema);
    EXECUTE format('GRANT CREATE ON SCHEMA %I TO service_role', r_schema);
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- 2) DEFAULT PRIVILEGES: funções novas NÃO terão EXECUTE para PUBLIC
--    e sim para authenticated/service_role. Aplica ao owner "postgres" no schema public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- (Opcional) Se criarmos muitas views no futuro, negar SELECT para PUBLIC por padrão.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM PUBLIC;
-- E garantir leitura apenas conforme políticas/RLS via roles de API:
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO authenticated, service_role;

-- 3) DEFAULT PRIVILEGES no schema storage (funções/objetos utilitários)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- 4) Telemetria
SELECT pg_notify(
  'app_log',
  '[SCHEMA] hardened: revoke CREATE (public/storage); default privileges set (no PUBLIC EXECUTE)'
);

-- =========================
-- Smokes (só leitura, opcionais)
-- =========================
-- a) Quem pode CREATE em public/storage? (esperado: postgres, service_role)
-- SELECT n.nspname, r.rolname, has_schema_privilege(r.rolname, n.nspname, 'CREATE') AS can_create
-- FROM pg_namespace n CROSS JOIN pg_roles r
-- WHERE n.nspname IN ('public','storage') AND r.rolname IN ('PUBLIC','authenticated','service_role','postgres')
-- ORDER BY n.nspname, r.rolname;

-- b) Confirmar default privileges (PUBLIC não deve ter EXECUTE em funções novas)
-- (Crie uma função dummy num ambiente de teste e inspecione privileges, se necessário.)
