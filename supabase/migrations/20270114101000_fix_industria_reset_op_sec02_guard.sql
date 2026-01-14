-- SEC-02: garantir que `industria_producao_reset_ordem` exige permissão via
-- `require_permission_for_current_user` (RG-03 asserts).
--
-- Observação: esta função já exige admin via `assert_empresa_role_at_least`,
-- mas precisamos do guard padrão para consistência e para bloquear bypass via console.

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_reset_ordem(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_status text;
  v_entregas int := 0;
  v_apont int := 0;
BEGIN
  PERFORM public.require_permission_for_current_user('industria', 'manage');
  PERFORM public.assert_empresa_role_at_least('admin');

  SELECT status
    INTO v_status
    FROM public.industria_producao_ordens
   WHERE id = p_id
     AND empresa_id = v_empresa_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  IF v_status NOT IN ('rascunho', 'planejada', 'em_programacao') THEN
    RAISE EXCEPTION 'Apenas ordens em rascunho/planejada/em_programacao podem ser revertidas.';
  END IF;

  IF to_regclass('public.industria_producao_entregas') IS NOT NULL THEN
    SELECT count(*) INTO v_entregas
      FROM public.industria_producao_entregas
     WHERE ordem_id = p_id
       AND empresa_id = v_empresa_id;
    IF v_entregas > 0 THEN
      RAISE EXCEPTION 'Não é possível reverter: há entregas registradas.';
    END IF;
  END IF;

  IF to_regclass('public.industria_producao_apontamentos') IS NOT NULL THEN
    SELECT count(*) INTO v_apont
      FROM public.industria_producao_apontamentos ap
      JOIN public.industria_producao_operacoes op ON op.id = ap.operacao_id
     WHERE op.ordem_id = p_id
       AND op.empresa_id = v_empresa_id
       AND ap.empresa_id = v_empresa_id;
    IF v_apont > 0 THEN
      RAISE EXCEPTION 'Não é possível reverter: há apontamentos já realizados.';
    END IF;
  END IF;

  -- Limpa reservas (não movimenta estoque físico, apenas bloqueios)
  IF to_regclass('public.industria_reservas') IS NOT NULL THEN
    DELETE FROM public.industria_reservas
     WHERE ordem_id = p_id
       AND empresa_id = v_empresa_id;
  END IF;

  -- Exclui operações (cascades limpam QA/apoios)
  DELETE FROM public.industria_producao_operacoes
   WHERE ordem_id = p_id
     AND empresa_id = v_empresa_id;

  -- Bypass controlado do state machine APENAS nesta transação.
  PERFORM set_config('revo.reset_ordem', '1', true);

  -- Retorna a OP para rascunho
  UPDATE public.industria_producao_ordens
     SET status = 'rascunho',
         updated_at = now()
   WHERE id = p_id
     AND empresa_id = v_empresa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_producao_reset_ordem(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.industria_producao_reset_ordem(uuid) TO authenticated, service_role;

COMMIT;

