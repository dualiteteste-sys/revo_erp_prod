-- Fix: permitir "Reverter OP" (reset) voltar status para rascunho quando a OP
-- estiver em 'planejada'/'em_programacao'.
--
-- Contexto:
-- - A RPC `industria_producao_reset_ordem` limpa operações/reservas e tenta setar
--   status='rascunho', mas a trigger de state machine bloqueava a transição
--   (em_programacao -> rascunho).
-- - Solução "estado da arte": permitir essa transição APENAS durante o reset,
--   usando uma flag de sessão `revo.reset_ordem=1` setada dentro da RPC (security definer).

BEGIN;

-- 1) Atualiza a trigger/state-machine para aceitar rascunho em modo reset.
CREATE OR REPLACE FUNCTION public._ind01_industria_producao_ordens_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_status text := public._ind01_normalize_status(old.status);
  v_new_status text := public._ind01_normalize_status(new.status);
  v_has_ops boolean := false;
  v_is_reset boolean := coalesce(nullif(current_setting('revo.reset_ordem', true), ''), '0') = '1';
BEGIN
  IF v_old_status IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'Ordem de produção está % e não pode ser alterada.', v_old_status;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.industria_producao_operacoes
     WHERE empresa_id = old.empresa_id AND ordem_id = old.id
  ) INTO v_has_ops;

  -- Para entrar em execução/inspeção/concluir, é obrigatório ter operações geradas
  IF v_new_status IN ('em_producao','em_inspecao','concluida') AND NOT v_has_ops THEN
    RAISE EXCEPTION 'Gere operações antes de mudar para %.', v_new_status;
  END IF;

  -- Com operações geradas, trava mudanças que mudariam a execução
  IF v_has_ops THEN
    IF new.produto_final_id IS DISTINCT FROM old.produto_final_id
      OR new.quantidade_planejada IS DISTINCT FROM old.quantidade_planejada
      OR new.unidade IS DISTINCT FROM old.unidade
      OR new.roteiro_aplicado_id IS DISTINCT FROM old.roteiro_aplicado_id
    THEN
      RAISE EXCEPTION 'Ordem travada: já possui operações geradas. Use Reset/Revisão.';
    END IF;
  END IF;

  -- State machine mínimo
  IF v_new_status IS DISTINCT FROM v_old_status THEN
    IF v_new_status = 'cancelada' AND v_old_status NOT IN ('rascunho','planejada','em_programacao') THEN
      PERFORM public.assert_empresa_role_at_least('admin');
    END IF;

    -- Bypass controlado: durante reset, permitir voltar para rascunho
    IF v_is_reset AND v_new_status = 'rascunho' AND v_old_status IN ('planejada','em_programacao') THEN
      RETURN new;
    END IF;

    IF v_old_status = 'rascunho' AND v_new_status NOT IN ('rascunho','planejada','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida (% -> %).', v_old_status, v_new_status;
    END IF;
    IF v_old_status = 'planejada' AND v_new_status NOT IN ('planejada','em_programacao','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida (% -> %).', v_old_status, v_new_status;
    END IF;
    IF v_old_status = 'em_programacao' AND v_new_status NOT IN ('em_programacao','em_producao','em_inspecao','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida (% -> %).', v_old_status, v_new_status;
    END IF;
    IF v_old_status = 'em_producao' AND v_new_status NOT IN ('em_producao','em_inspecao','concluida','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida (% -> %).', v_old_status, v_new_status;
    END IF;
    IF v_old_status = 'em_inspecao' AND v_new_status NOT IN ('em_inspecao','concluida','cancelada') THEN
      RAISE EXCEPTION 'Transição inválida (% -> %).', v_old_status, v_new_status;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- 2) Atualiza a RPC para acionar o bypass apenas dentro do reset.
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

