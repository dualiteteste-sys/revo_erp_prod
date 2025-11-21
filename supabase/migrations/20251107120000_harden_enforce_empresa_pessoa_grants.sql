-- =============================================================================
-- Migração: Revogar EXECUTE de PUBLIC em função residual
-- Data: 2025-11-07
-- Objetivo: remover EXECUTE de PUBLIC na enforce_same_empresa_pessoa(...)
--           e manter apenas authenticated / service_role.
-- =============================================================================

DO $$
DECLARE
  v_args text;
BEGIN
  -- Descobre a assinatura exata (args) da função
  SELECT pg_get_function_identity_arguments(p.oid)
    INTO v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'enforce_same_empresa_pessoa'
  LIMIT 1;

  IF v_args IS NULL THEN
    RAISE NOTICE '[GRANTS] Função enforce_same_empresa_pessoa não encontrada; nada a fazer.';
    RETURN;
  END IF;

  -- Revoga PUBLIC (idempotente)
  EXECUTE format('REVOKE EXECUTE ON FUNCTION public.enforce_same_empresa_pessoa(%s) FROM PUBLIC', v_args);

  -- Garante EXECUTE para authenticated e service_role (idempotente)
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.enforce_same_empresa_pessoa(%s) TO authenticated, service_role', v_args);

  PERFORM pg_notify('app_log', '[GRANTS] hardened: revoke PUBLIC; keep authenticated, service_role -> enforce_same_empresa_pessoa(' || v_args || ')');
END
$$ LANGUAGE plpgsql;
