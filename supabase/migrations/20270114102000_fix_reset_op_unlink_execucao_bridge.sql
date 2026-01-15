-- Fix: após "Reverter OP" (reset da `industria_producao_ordens`), a OP/OB do módulo unificado
-- (`industria_ordens`) ainda pode ficar apontando para `execucao_ordem_id`, impedindo:
-- - Excluir a ordem de execução (FK `industria_ordens_execucao_ordem_fkey`)
-- - Gerar uma nova execução com consistência
--
-- Solução:
-- - No reset: limpar `industria_ordens.execucao_ordem_id` e `execucao_gerada_em` para o espelho.
-- - No delete da ordem de execução: limpar o bridge antes de deletar.
--
-- Observação: o reset já bloqueia entregas/apontamentos; isso permanece.

BEGIN;

-- 1) Reset: desvincular bridge (industria_ordens -> execucao_ordem_id)
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

  -- Desvincula o espelho no módulo unificado (evita FK e destrava edição/geração)
  IF to_regclass('public.industria_ordens') IS NOT NULL THEN
    UPDATE public.industria_ordens
       SET execucao_ordem_id = NULL,
           execucao_gerada_em = NULL,
           updated_at = now()
     WHERE empresa_id = v_empresa_id
       AND execucao_ordem_id = p_id;
  END IF;

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

-- 2) Delete: limpar bridge antes de deletar a ordem de execução (evita 23503)
DO $$
BEGIN
  IF to_regprocedure('public.industria_producao_ordens_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete__unsafe(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        v_empresa_id uuid := public.current_empresa_id();
        v_status text;
        v_deleted int := 0;
      BEGIN
        SELECT status
          INTO v_status
          FROM public.industria_producao_ordens
         WHERE id = p_id
           AND empresa_id = v_empresa_id;

        IF v_status IS NULL THEN
          RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
        END IF;

        IF v_status <> 'rascunho' THEN
          RAISE EXCEPTION 'Somente ordens em rascunho podem ser excluídas.';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM public.industria_producao_operacoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui operações.';
        END IF;

        IF to_regclass('public.industria_producao_entregas') IS NOT NULL AND EXISTS (
          SELECT 1
            FROM public.industria_producao_entregas
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui entregas.';
        END IF;

        -- Desvincula bridge (se existir) antes do DELETE, evitando FK 23503
        IF to_regclass('public.industria_ordens') IS NOT NULL THEN
          UPDATE public.industria_ordens
             SET execucao_ordem_id = NULL,
                 execucao_gerada_em = NULL,
                 updated_at = now()
           WHERE empresa_id = v_empresa_id
             AND execucao_ordem_id = p_id;
        END IF;

        DELETE FROM public.industria_producao_ordens
         WHERE id = p_id AND empresa_id = v_empresa_id;

        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted <> 1 THEN
          RAISE EXCEPTION 'Exclusão não realizada (ordem preservada por integridade/permissão).';
        END IF;
      END;
      $body$;
    $sql$;

    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) TO service_role, postgres';
  END IF;
END $$;

COMMIT;

