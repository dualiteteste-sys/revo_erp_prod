-- =============================================================================
-- Migração (opcional): Hardening das funções de triggers de negócio
-- - Ajusta search_path para 'pg_catalog','public'
-- - Garante SECURITY INVOKER (sem elevar privilégios)
-- - Não altera lógica das funções
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Lista alvo (nomes conforme diagnóstico)
  FOR r IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS is_security_definer,
           p.proconfig  AS proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'tg_os_item_after_recalc',
        'tg_os_item_total_and_recalc',
        'tg_os_set_numero',
        'enforce_same_empresa_pessoa',
        'enforce_same_empresa_produto_ou_fornecedor'
      )
  LOOP
    -- 1) Fixar search_path por função (idempotente)
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = %s',
      r.schema_name, r.func_name, r.args, quote_literal('pg_catalog, public')
    );

    -- 2) Garantir SECURITY INVOKER (se estiver como DEFINER)
    IF r.is_security_definer THEN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SECURITY INVOKER',
                     r.schema_name, r.func_name, r.args);
    END IF;
  END LOOP;

  PERFORM pg_notify('app_log',
    '[TRIGGER-HARDEN] search_path=pg_catalog,public + SECURITY INVOKER aplicados às funções alvo');
END
$$ LANGUAGE plpgsql;

-- Smoke (opcional): verificar resultado
-- SELECT
--   n.nspname AS schema,
--   p.proname AS func,
--   p.prosecdef AS is_security_definer,
--   p.proconfig AS proconfig
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'tg_os_item_after_recalc',
--     'tg_os_item_total_and_recalc',
--     'tg_os_set_numero',
--     'enforce_same_empresa_pessoa',
--     'enforce_same_empresa_produto_ou_fornecedor'
--   )
-- ORDER BY func;
