-- Recurso: resetar operação individual (remover operação e vínculos) para casos gerados por engano.
-- Regras:
-- - Admin/owner apenas.
-- - Ordem deve estar em rascunho/planejada/em_programacao.
-- - Se p_force = false, bloqueia se houver apontamentos.
-- - Se p_force = true, remove operação mesmo com apontamentos (cascades limpam QA/apontamentos).
-- - Se nenhuma operação restar, ordem volta para rascunho.

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_reset_operacao(p_operacao_id uuid, p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_ordem_id uuid;
  v_status_ordem text;
  v_apont int := 0;
  v_ops_restantes int := 0;
BEGIN
  PERFORM public.assert_empresa_role_at_least('admin');

  SELECT o.ordem_id, ord.status
    INTO v_ordem_id, v_status_ordem
    FROM public.industria_producao_operacoes o
    JOIN public.industria_producao_ordens ord ON ord.id = o.ordem_id
   WHERE o.id = p_operacao_id
     AND o.empresa_id = v_empresa_id
     AND ord.empresa_id = v_empresa_id;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada ou acesso negado.';
  END IF;

  IF v_status_ordem NOT IN ('rascunho', 'planejada', 'em_programacao') THEN
    RAISE EXCEPTION 'Apenas ordens em rascunho/planejada/em_programacao podem ter operações revertidas.';
  END IF;

  IF NOT p_force THEN
    IF to_regclass('public.industria_producao_apontamentos') IS NOT NULL THEN
      SELECT count(*) INTO v_apont
        FROM public.industria_producao_apontamentos ap
       WHERE ap.operacao_id = p_operacao_id
         AND ap.empresa_id = v_empresa_id;
      IF v_apont > 0 THEN
        RAISE EXCEPTION 'Não é possível reverter: há apontamentos já realizados nesta operação.';
      END IF;
    END IF;
  END IF;

  DELETE FROM public.industria_producao_operacoes
   WHERE id = p_operacao_id
     AND empresa_id = v_empresa_id;

  -- Se não restarem operações, volta OP para rascunho
  SELECT count(*) INTO v_ops_restantes
    FROM public.industria_producao_operacoes
   WHERE ordem_id = v_ordem_id
     AND empresa_id = v_empresa_id;

  IF v_ops_restantes = 0 THEN
    UPDATE public.industria_producao_ordens
       SET status = 'rascunho',
           updated_at = now()
     WHERE id = v_ordem_id
       AND empresa_id = v_empresa_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_producao_reset_operacao(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.industria_producao_reset_operacao(uuid, boolean) TO authenticated, service_role;

COMMIT;

