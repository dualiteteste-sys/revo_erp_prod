-- Fix registrar_evento RPC logic and Event Names
-- Restoring robust logic from earlier version and aligning with Frontend

BEGIN;

-- Em produção pode haver concorrência no catálogo (pg_proc) durante deploys paralelos,
-- resultando em "tuple concurrently deleted". Fazemos retry defensivo do DDL.
DO $ddl$
DECLARE
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_registrar_evento(p_operacao_id uuid, p_tipo_evento text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $func$
      DECLARE
        v_status_atual text;
        v_seq int;
        v_ordem_id uuid;
        v_prev_concluida boolean;
        v_prev_transferida numeric;
        v_permite_overlap_anterior boolean;
        v_qtd_produzida numeric;
      BEGIN
        -- 1. Get Operation Details
        SELECT status, sequencia, ordem_id, quantidade_produzida
        INTO v_status_atual, v_seq, v_ordem_id, v_qtd_produzida
        FROM public.industria_producao_operacoes
        WHERE id = p_operacao_id;

        -- 2. Handle 'iniciar'
        IF p_tipo_evento = 'iniciar' THEN
          IF v_status_atual NOT IN ('na_fila', 'pendente', 'pausada', 'em_preparacao') THEN
            RAISE EXCEPTION 'Operação não pode ser iniciada (status atual: %)', v_status_atual;
          END IF;

          -- Update Order Status to 'em_producao' if it's the first activity
          UPDATE public.industria_producao_ordens
          SET status = 'em_producao'
          WHERE id = v_ordem_id AND status IN ('planejada', 'em_programacao');

          -- Sequence/Overlap Validation (Simpler version for stability)
          -- If seq > 10, check previous.
          IF v_seq > 10 THEN
            SELECT status = 'concluida', quantidade_transferida, permite_overlap
            INTO v_prev_concluida, v_prev_transferida, v_permite_overlap_anterior
            FROM public.industria_producao_operacoes
            WHERE ordem_id = v_ordem_id AND sequencia < v_seq
            ORDER BY sequencia DESC LIMIT 1;

            IF v_prev_concluida IS NOT NULL THEN -- Previous exists
              IF NOT v_prev_concluida THEN
                -- If previous not done, check overlap
                IF NOT v_permite_overlap_anterior THEN
                  RAISE EXCEPTION 'Etapa anterior não concluída e não permite overlap.';
                END IF;
              END IF;
            END IF;
          END IF;

          -- Update Status
          UPDATE public.industria_producao_operacoes
          SET status = 'em_execucao',
              data_inicio_real = COALESCE(data_inicio_real, now()),
              updated_at = now()
          WHERE id = p_operacao_id;

          -- Log
          INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
          VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'producao', 'Iniciado');

        -- 3. Handle 'pausar'
        ELSIF p_tipo_evento = 'pausar' THEN
          UPDATE public.industria_producao_operacoes SET status = 'pausada', updated_at = now() WHERE id = p_operacao_id;
          INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
          VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'parada', 'Pausado');

        -- 4. Handle 'retomar'
        ELSIF p_tipo_evento = 'retomar' THEN
          UPDATE public.industria_producao_operacoes SET status = 'em_execucao', updated_at = now() WHERE id = p_operacao_id;
          INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
          VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'retorno', 'Retomado');

        -- 5. Handle 'concluir'
        ELSIF p_tipo_evento = 'concluir' THEN
          UPDATE public.industria_producao_operacoes
          SET status = 'concluida',
              data_fim_real = now(),
              quantidade_transferida = quantidade_produzida, -- Auto-transfer logic
              updated_at = now()
          WHERE id = p_operacao_id;

          INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
          VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'conclusao', 'Concluído');

        ELSE
          RAISE EXCEPTION 'Tipo de evento inválido: %', p_tipo_evento;
        END IF;

      END;
      $func$;
      $sql$;
      EXIT;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLSTATE = 'XX000' AND position('tuple concurrently' in SQLERRM) > 0 AND v_attempt < 8 THEN
          PERFORM pg_sleep(0.15 * v_attempt);
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;
END
$ddl$;

COMMIT;
