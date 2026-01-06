/*
  IND-STA-02 — Execução (apontamentos) v2: lote + qualidade + custos (mínimo viável)

  Motivo:
  - Hoje o apontamento de execução (conclusão/parada) não registra lote produzido nem custo unitário.
  - Para rastreabilidade (lotes/QA) e futura custeio (DRE/estoque), precisamos persistir esses dados no apontamento.

  Impacto:
  - Apenas evolução de dados (ALTER TABLE + novas RPCs). Não remove colunas/objetos existentes.
  - Frontend deve passar a chamar `industria_operacao_apontar_execucao_v2`.

  Reversibilidade:
  - Reverter = remover a chamada no app + (opcional) dropar colunas e funções adicionadas aqui.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Schema: enriquecer apontamentos com lote/qualidade/custo
-- -----------------------------------------------------------------------------
ALTER TABLE public.industria_producao_apontamentos
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS lote_id uuid,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric,
  ADD COLUMN IF NOT EXISTS custo_total numeric;

-- FK opcional para lote (best-effort: só cria se tabela existir)
DO $$
BEGIN
  IF to_regclass('public.estoque_lotes') IS NOT NULL THEN
    ALTER TABLE public.industria_producao_apontamentos
      DROP CONSTRAINT IF EXISTS industria_producao_apontamentos_lote_id_fkey;
    ALTER TABLE public.industria_producao_apontamentos
      ADD CONSTRAINT industria_producao_apontamentos_lote_id_fkey
      FOREIGN KEY (lote_id) REFERENCES public.estoque_lotes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ind_apontamentos_lote ON public.industria_producao_apontamentos(empresa_id, lote);

-- -----------------------------------------------------------------------------
-- 2) RPC v2: apontar execução com lote + motivo_refugo_id + custo (com enforcement)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_operacao_apontar_execucao_v2(
  uuid, text, numeric, numeric, text, text, uuid, text, numeric
);
DROP FUNCTION IF EXISTS public._industria_operacao_apontar_execucao_v2(
  uuid, text, numeric, numeric, text, text, uuid, text, numeric
);

CREATE OR REPLACE FUNCTION public._industria_operacao_apontar_execucao_v2(
  p_operacao_id uuid,
  p_acao text,
  p_qtd_boas numeric DEFAULT 0,
  p_qtd_refugadas numeric DEFAULT 0,
  p_motivo_refugo text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_motivo_refugo_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_custo_unitario numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_auto_avancar boolean := true;
  v_refugo_percent numeric := 5;
  v_ordem_id uuid;
  v_ordem_status text;
  v_sequencia int;
  v_planejada numeric;
  v_prod numeric;
  v_ref numeric;
  v_percent_refugo numeric;
  v_next_op uuid;

  -- estoque (best-effort)
  v_produto_final_id uuid;
  v_lote text := NULL;
  v_saldo_ant numeric := 0;
  v_saldo_novo numeric := 0;
  v_custo_ant numeric := 0;
  v_custo_novo numeric := 0;
BEGIN
  SELECT op.ordem_id, op.sequencia, op.quantidade_planejada, op.quantidade_produzida, op.quantidade_refugo, o.status
    INTO v_ordem_id, v_sequencia, v_planejada, v_prod, v_ref, v_ordem_status
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens o ON o.id = op.ordem_id
   WHERE op.id = p_operacao_id
     AND op.empresa_id = v_emp
     AND o.empresa_id = v_emp;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada.';
  END IF;

  IF v_ordem_status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Não é permitido apontar execução: ordem está %.', v_ordem_status;
  END IF;

  BEGIN
    v_auto_avancar := COALESCE((public.industria_automacao_get()->>'auto_avancar')::boolean, true);
  EXCEPTION WHEN OTHERS THEN
    v_auto_avancar := true;
  END;
  BEGIN
    v_refugo_percent := COALESCE((public.industria_automacao_get()->>'alerta_refugo_percent')::numeric, 5);
  EXCEPTION WHEN OTHERS THEN
    v_refugo_percent := 5;
  END;

  IF p_acao = 'iniciar' THEN
    UPDATE public.industria_producao_operacoes
       SET status = 'em_execucao',
           data_inicio_real = COALESCE(data_inicio_real, now()),
           updated_at = now()
     WHERE id = p_operacao_id AND empresa_id = v_emp;

    UPDATE public.industria_producao_ordens
       SET status = CASE WHEN status IN ('planejada','em_programacao') THEN 'em_producao' ELSE status END,
           updated_at = now()
     WHERE id = v_ordem_id AND empresa_id = v_emp AND status NOT IN ('concluida','cancelada');

  ELSIF p_acao = 'pausar' THEN
    UPDATE public.industria_producao_operacoes
       SET status = 'em_espera',
           updated_at = now()
     WHERE id = p_operacao_id AND empresa_id = v_emp;

    INSERT INTO public.industria_producao_apontamentos (
      empresa_id, operacao_id, usuario_id, tipo,
      quantidade_boa, quantidade_refugo,
      motivo_refugo, motivo_refugo_id,
      observacoes, data_apontamento,
      lote, custo_unitario, custo_total
    ) VALUES (
      v_emp, p_operacao_id, v_user, 'parada',
      0, 0,
      NULL, NULL,
      p_observacoes, now(),
      NULL, NULL, NULL
    );

  ELSIF p_acao = 'concluir' THEN
    UPDATE public.industria_producao_operacoes
       SET quantidade_produzida = quantidade_produzida + COALESCE(p_qtd_boas,0),
           quantidade_refugo    = quantidade_refugo    + COALESCE(p_qtd_refugadas,0),
           status = CASE WHEN (quantidade_produzida + COALESCE(p_qtd_boas,0)) >= quantidade_planejada
                         THEN 'concluida' ELSE 'pendente' END,
           data_fim_real = CASE WHEN (quantidade_produzida + COALESCE(p_qtd_boas,0)) >= quantidade_planejada
                         THEN now() ELSE data_fim_real END,
           updated_at = now()
     WHERE id = p_operacao_id AND empresa_id = v_emp;

    v_lote := NULLIF(trim(COALESCE(p_lote, '')), '');

    INSERT INTO public.industria_producao_apontamentos (
      empresa_id, operacao_id, usuario_id, tipo,
      quantidade_boa, quantidade_refugo,
      motivo_refugo, motivo_refugo_id,
      observacoes, data_apontamento,
      lote, custo_unitario, custo_total
    ) VALUES (
      v_emp, p_operacao_id, v_user, 'conclusao',
      COALESCE(p_qtd_boas,0), COALESCE(p_qtd_refugadas,0),
      p_motivo_refugo, p_motivo_refugo_id,
      p_observacoes, now(),
      v_lote,
      p_custo_unitario,
      CASE
        WHEN p_custo_unitario IS NULL THEN NULL
        ELSE round(p_custo_unitario * COALESCE(p_qtd_boas,0), 4)
      END
    );

    -- best-effort: dar entrada do produto final no estoque (se houver)
    BEGIN
      SELECT produto_final_id
        INTO v_produto_final_id
        FROM public.industria_producao_ordens
       WHERE id = v_ordem_id AND empresa_id = v_emp;

      IF v_produto_final_id IS NOT NULL AND COALESCE(p_qtd_boas,0) > 0 AND to_regclass('public.estoque_saldos') IS NOT NULL THEN
        INSERT INTO public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
        VALUES (v_emp, v_produto_final_id, 0, 0)
        ON CONFLICT (empresa_id, produto_id) DO NOTHING;

        SELECT saldo, custo_medio
          INTO v_saldo_ant, v_custo_ant
          FROM public.estoque_saldos
         WHERE empresa_id = v_emp AND produto_id = v_produto_final_id
         FOR UPDATE;

        v_saldo_novo := COALESCE(v_saldo_ant, 0) + COALESCE(p_qtd_boas, 0);

        IF p_custo_unitario IS NOT NULL AND v_saldo_novo > 0 THEN
          v_custo_novo := ((COALESCE(v_saldo_ant,0) * COALESCE(v_custo_ant,0)) + (COALESCE(p_qtd_boas,0) * p_custo_unitario)) / v_saldo_novo;
        ELSE
          v_custo_novo := COALESCE(v_custo_ant,0);
        END IF;

        UPDATE public.estoque_saldos
           SET saldo = v_saldo_novo,
               custo_medio = v_custo_novo,
               updated_at = now()
         WHERE empresa_id = v_emp AND produto_id = v_produto_final_id;

        -- lote (fallback)
        v_lote := COALESCE(v_lote, 'SEM_LOTE');
        IF to_regclass('public.estoque_lotes') IS NOT NULL THEN
          INSERT INTO public.estoque_lotes (empresa_id, produto_id, lote, saldo, custo_medio)
          VALUES (v_emp, v_produto_final_id, v_lote, COALESCE(p_qtd_boas,0), v_custo_novo)
          ON CONFLICT (empresa_id, produto_id, lote)
          DO UPDATE SET
            saldo = public.estoque_lotes.saldo + excluded.saldo,
            custo_medio = COALESCE(excluded.custo_medio, public.estoque_lotes.custo_medio),
            updated_at = now();
        END IF;

        -- movimento (kardex)
        IF to_regclass('public.estoque_movimentos') IS NOT NULL THEN
          INSERT INTO public.estoque_movimentos (
            empresa_id, produto_id, data_movimento,
            tipo, tipo_mov, quantidade,
            saldo_anterior, saldo_atual,
            custo_medio, valor_unitario,
            origem_tipo, origem_id, lote, observacoes
          ) VALUES (
            v_emp, v_produto_final_id, current_date,
            'entrada', 'entrada_producao', COALESCE(p_qtd_boas,0),
            COALESCE(v_saldo_ant,0), v_saldo_novo,
            v_custo_novo, p_custo_unitario,
            'ordem_producao', v_ordem_id, v_lote,
            'Produção OP ' || (SELECT numero FROM public.industria_producao_ordens WHERE id = v_ordem_id)
          );
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Estoque é best-effort aqui; não bloqueia a execução
      NULL;
    END;

    SELECT quantidade_planejada, quantidade_produzida, quantidade_refugo
      INTO v_planejada, v_prod, v_ref
      FROM public.industria_producao_operacoes
     WHERE id = p_operacao_id AND empresa_id = v_emp;

    IF (v_prod + v_ref) > 0 THEN
      v_percent_refugo := round((v_ref / (v_prod + v_ref)) * 100, 2);
    ELSE
      v_percent_refugo := 0;
    END IF;

    IF v_percent_refugo >= v_refugo_percent AND v_refugo_percent > 0 THEN
      UPDATE public.industria_producao_operacoes
         SET status = 'em_espera',
             updated_at = now()
       WHERE id = p_operacao_id AND empresa_id = v_emp;
    END IF;

    IF v_auto_avancar AND (SELECT status FROM public.industria_producao_operacoes WHERE id = p_operacao_id) = 'concluida' THEN
      SELECT id INTO v_next_op
        FROM public.industria_producao_operacoes
       WHERE empresa_id = v_emp
         AND ordem_id = v_ordem_id
         AND sequencia > v_sequencia
         AND status IN ('na_fila', 'pendente')
       ORDER BY sequencia ASC
       LIMIT 1;

      IF v_next_op IS NOT NULL THEN
        UPDATE public.industria_producao_operacoes
           SET status = 'pendente',
               updated_at = now()
         WHERE id = v_next_op AND empresa_id = v_emp;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.industria_producao_operacoes
         WHERE empresa_id = v_emp AND ordem_id = v_ordem_id AND status <> 'concluida'
      ) THEN
        UPDATE public.industria_producao_ordens
           SET status = 'concluida',
               updated_at = now()
         WHERE id = v_ordem_id AND empresa_id = v_emp AND status NOT IN ('concluida','cancelada');
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Ação inválida. Use iniciar|pausar|concluir.';
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_operacao_apontar_execucao_v2 op='||p_operacao_id||' acao='||p_acao);
END;
$$;

-- Wrapper com enforcement (padrão SEC-MT-02)
CREATE OR REPLACE FUNCTION public.industria_operacao_apontar_execucao_v2(
  p_operacao_id uuid,
  p_acao text,
  p_qtd_boas numeric DEFAULT 0,
  p_qtd_refugadas numeric DEFAULT 0,
  p_motivo_refugo text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_motivo_refugo_id uuid DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_custo_unitario numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('industria', 'update');
  PERFORM public._industria_operacao_apontar_execucao_v2(
    p_operacao_id, p_acao, p_qtd_boas, p_qtd_refugadas, p_motivo_refugo, p_observacoes, p_motivo_refugo_id, p_lote, p_custo_unitario
  );
END;
$$;

REVOKE ALL ON FUNCTION public._industria_operacao_apontar_execucao_v2(
  uuid, text, numeric, numeric, text, text, uuid, text, numeric
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._industria_operacao_apontar_execucao_v2(
  uuid, text, numeric, numeric, text, text, uuid, text, numeric
) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.industria_operacao_apontar_execucao_v2(
  uuid, text, numeric, numeric, text, text, uuid, text, numeric
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.industria_operacao_apontar_execucao_v2(
  uuid, text, numeric, numeric, text, text, uuid, text, numeric
) TO authenticated, service_role;

COMMIT;

