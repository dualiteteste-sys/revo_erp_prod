-- =============================================================================
-- QA gating: IP before transfer, IF before concluir operação
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.industria_producao_transferir_lote(uuid, numeric);
CREATE OR REPLACE FUNCTION public.industria_producao_transferir_lote(p_operacao_id uuid, p_qtd numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_qtd_prod numeric;
  v_qtd_transf numeric;
  v_permite_overlap boolean;
  v_require_ip boolean;
  v_ip_aprovada boolean := false;
BEGIN
  SELECT quantidade_produzida,
         quantidade_transferida,
         COALESCE(permite_overlap, false),
         COALESCE(require_ip, false)
    INTO v_qtd_prod, v_qtd_transf, v_permite_overlap, v_require_ip
    FROM public.industria_producao_operacoes
   WHERE id = p_operacao_id
     AND empresa_id = v_empresa_id;

  IF v_qtd_prod IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada.';
  END IF;

  IF v_require_ip THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.industria_qualidade_inspecoes iq
       WHERE iq.operacao_id = p_operacao_id
         AND iq.tipo = 'IP'
         AND iq.resultado = 'aprovada'
         AND iq.empresa_id = v_empresa_id
    ) INTO v_ip_aprovada;

    IF NOT v_ip_aprovada THEN
      RAISE EXCEPTION 'IP pendente nesta etapa. Realize a inspeção para liberar a transferência.';
    END IF;
  END IF;

  IF NOT v_permite_overlap THEN
    RAISE EXCEPTION 'Esta operação não permite transferência parcial (Overlap desativado).';
  END IF;

  IF COALESCE(p_qtd, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade válida para transferir.';
  END IF;

  IF (COALESCE(v_qtd_transf, 0) + p_qtd) > COALESCE(v_qtd_prod, 0) THEN
    RAISE EXCEPTION 'Quantidade a transferir excede o saldo produzido disponível.';
  END IF;

  UPDATE public.industria_producao_operacoes
     SET quantidade_transferida = COALESCE(quantidade_transferida,0) + p_qtd,
         updated_at = now()
   WHERE id = p_operacao_id;
END;
$$;

DROP FUNCTION IF EXISTS public.industria_producao_registrar_evento(uuid, text);
CREATE OR REPLACE FUNCTION public.industria_producao_registrar_evento(p_operacao_id uuid, p_tipo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status_atual text;
  v_seq int;
  v_ordem_id uuid;
  v_prev_concluida boolean;
  v_prev_transferida numeric;
  v_permite_overlap_anterior boolean;
  v_prev_require_ip boolean;
  v_prev_operacao_id uuid;
  v_require_if boolean;
BEGIN
  SELECT status, sequencia, ordem_id, COALESCE(require_if, false)
    INTO v_status_atual, v_seq, v_ordem_id, v_require_if
    FROM public.industria_producao_operacoes
   WHERE id = p_operacao_id
     AND empresa_id = public.current_empresa_id();

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada.';
  END IF;

  IF p_tipo = 'iniciar' THEN
    IF v_status_atual NOT IN ('na_fila', 'pendente', 'pausada', 'em_preparacao') THEN
       RAISE EXCEPTION 'Operação não pode ser iniciada (status atual: %)', v_status_atual;
    END IF;

    UPDATE public.industria_producao_ordens 
       SET status = 'em_producao' 
     WHERE id = v_ordem_id
       AND status IN ('planejada', 'em_programacao');

    IF v_seq > 10 THEN 
       SELECT id, status = 'concluida', quantidade_transferida, COALESCE(permite_overlap, false), COALESCE(require_ip, false)
         INTO v_prev_operacao_id, v_prev_concluida, v_prev_transferida, v_permite_overlap_anterior, v_prev_require_ip
         FROM public.industria_producao_operacoes
        WHERE ordem_id = v_ordem_id AND sequencia < v_seq
        ORDER BY sequencia DESC LIMIT 1;
       
       IF v_prev_operacao_id IS NOT NULL THEN
           IF v_prev_require_ip AND NOT EXISTS (
                SELECT 1 FROM public.industria_qualidade_inspecoes iq
                WHERE iq.operacao_id = v_prev_operacao_id
                  AND iq.tipo = 'IP'
                  AND iq.resultado = 'aprovada'
                  AND iq.empresa_id = public.current_empresa_id()
           ) THEN
               RAISE EXCEPTION 'IP pendente nesta etapa. Realize a inspeção para liberar a próxima.';
           END IF;

           IF NOT v_prev_concluida THEN
              IF NOT v_permite_overlap_anterior THEN
                 RAISE EXCEPTION 'Etapa anterior não concluída e não permite overlap.';
              END IF;
              IF v_prev_transferida <= 0 THEN
                 RAISE EXCEPTION 'Etapa anterior permite overlap mas nenhum lote foi transferido ainda.';
              END IF;
           END IF;
       END IF;
    END IF;

    UPDATE public.industria_producao_operacoes
       SET status = 'em_execucao',
           data_inicio_real = COALESCE(data_inicio_real, now()),
           updated_at = now()
     WHERE id = p_operacao_id;

    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'producao', 'Iniciado');

  ELSIF p_tipo = 'pausar' THEN
    UPDATE public.industria_producao_operacoes SET status = 'pausada', updated_at = now() WHERE id = p_operacao_id;
    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'parada', 'Pausado');

  ELSIF p_tipo = 'retomar' THEN
    UPDATE public.industria_producao_operacoes SET status = 'em_execucao', updated_at = now() WHERE id = p_operacao_id;
    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'retorno', 'Retomado');

  ELSIF p_tipo = 'concluir' THEN
    IF v_require_if THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.industria_qualidade_inspecoes iq
            WHERE iq.operacao_id = p_operacao_id
              AND iq.tipo = 'IF'
              AND iq.resultado = 'aprovada'
              AND iq.empresa_id = public.current_empresa_id()
        ) THEN
            RAISE EXCEPTION 'Inspeção Final pendente. Realize a IF para concluir esta operação.';
        END IF;
    END IF;

    UPDATE public.industria_producao_operacoes
    SET status = 'concluida',
        data_fim_real = now(),
        quantidade_transferida = quantidade_produzida,
        updated_at = now()
    WHERE id = p_operacao_id;

    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'conclusao', 'Concluído');
  END IF;
END;
$$;

COMMIT;
