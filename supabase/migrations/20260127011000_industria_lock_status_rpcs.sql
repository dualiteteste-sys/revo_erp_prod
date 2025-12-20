-- =============================================================================
-- Indústria: Blindagem de ciclo de vida (read-only) em status concluída/cancelada
-- - Evita "reabrir" registros por ações de UI ou automações de execução
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- OP (Produção): impedir edição via upsert quando concluída/cancelada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_producao_upsert_ordem(jsonb);
CREATE OR REPLACE FUNCTION public.industria_producao_upsert_ordem(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
  v_status_atual text;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status
      INTO v_status_atual
      FROM public.industria_producao_ordens
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    UPDATE public.industria_producao_ordens
       SET
         origem_ordem         = COALESCE(p_payload->>'origem_ordem', 'manual'),
         produto_final_id     = (p_payload->>'produto_final_id')::uuid,
         quantidade_planejada = (p_payload->>'quantidade_planejada')::numeric,
         unidade              = p_payload->>'unidade',
         status               = COALESCE(p_payload->>'status', 'rascunho'),
         prioridade           = COALESCE((p_payload->>'prioridade')::int, 0),
         data_prevista_inicio = (p_payload->>'data_prevista_inicio')::date,
         data_prevista_fim    = (p_payload->>'data_prevista_fim')::date,
         data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
         documento_ref        = p_payload->>'documento_ref',
         observacoes          = p_payload->>'observacoes',
         roteiro_aplicado_id        = (p_payload->>'roteiro_aplicado_id')::uuid,
         roteiro_aplicado_desc      = p_payload->>'roteiro_aplicado_desc',
         bom_aplicado_id            = (p_payload->>'bom_aplicado_id')::uuid,
         bom_aplicado_desc          = p_payload->>'bom_aplicado_desc',
         lote_producao              = p_payload->>'lote_producao',
         reserva_modo               = COALESCE(p_payload->>'reserva_modo', 'ao_liberar'),
         tolerancia_overrun_percent = COALESCE((p_payload->>'tolerancia_overrun_percent')::numeric, 0)
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.industria_producao_ordens (
      empresa_id,
      origem_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes,
      roteiro_aplicado_id,
      roteiro_aplicado_desc,
      bom_aplicado_id,
      bom_aplicado_desc,
      lote_producao,
      reserva_modo,
      tolerancia_overrun_percent
    ) VALUES (
      v_empresa_id,
      COALESCE(p_payload->>'origem_ordem', 'manual'),
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      COALESCE(p_payload->>'status', 'rascunho'),
      COALESCE((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      (p_payload->>'roteiro_aplicado_id')::uuid,
      p_payload->>'roteiro_aplicado_desc',
      (p_payload->>'bom_aplicado_id')::uuid,
      p_payload->>'bom_aplicado_desc',
      p_payload->>'lote_producao',
      COALESCE(p_payload->>'reserva_modo', 'ao_liberar'),
      COALESCE((p_payload->>'tolerancia_overrun_percent')::numeric, 0)
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_producao_upsert_ordem: ' || v_id);
  RETURN public.industria_producao_get_ordem_details(v_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.industria_producao_upsert_ordem(jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OP: gerar operações não deve ocorrer em concluída/cancelada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_producao_gerar_operacoes(uuid);
CREATE OR REPLACE FUNCTION public.industria_producao_gerar_operacoes(p_ordem_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_roteiro_id uuid;
  v_qtd_planejada numeric;
  v_exists boolean;
  v_status text;
  r record;
BEGIN
  SELECT roteiro_aplicado_id, quantidade_planejada, status
    INTO v_roteiro_id, v_qtd_planejada, v_status
    FROM public.industria_producao_ordens
   WHERE id = p_ordem_id
     AND empresa_id = v_empresa_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  IF v_status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Não é permitido gerar operações para uma ordem % (%).', p_ordem_id, v_status;
  END IF;

  IF v_roteiro_id IS NULL THEN
    RAISE EXCEPTION 'Ordem sem roteiro aplicado.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.industria_producao_operacoes WHERE ordem_id = p_ordem_id)
    INTO v_exists;

  IF v_exists THEN
    RETURN;
  END IF;

  FOR r IN (
    SELECT *
      FROM public.industria_roteiros_etapas
     WHERE roteiro_id = v_roteiro_id
     ORDER BY sequencia
  ) LOOP
    INSERT INTO public.industria_producao_operacoes (
      empresa_id,
      ordem_id,
      sequencia,
      centro_trabalho_id,
      centro_trabalho_nome,
      tipo_operacao,
      permite_overlap,
      tempo_setup_min,
      tempo_ciclo_min_por_unidade,
      quantidade_planejada,
      status
    ) VALUES (
      v_empresa_id,
      p_ordem_id,
      r.sequencia,
      r.centro_trabalho_id,
      r.operacao_nome,
      'producao',
      COALESCE(r.permite_overlap, false),
      COALESCE(r.tempo_setup_min, 0),
      COALESCE(r.tempo_ciclo_min_por_unidade, 0),
      v_qtd_planejada,
      'na_fila'
    );
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.industria_producao_gerar_operacoes(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OP: fechar não pode atuar em cancelada (idempotente em concluída)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_producao_fechar(uuid);
CREATE OR REPLACE FUNCTION public.industria_producao_fechar(p_ordem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_ordem record;
  v_comp record;
  v_qtd_necessaria_total numeric;
  v_qtd_pendente numeric;
  v_lote_rec record;
  v_consumir_lote numeric;
BEGIN
  SELECT * INTO v_ordem
    FROM public.industria_producao_ordens
   WHERE id = p_ordem_id AND empresa_id = v_empresa_id;

  IF v_ordem IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada.';
  END IF;

  IF v_ordem.status = 'cancelada' THEN
    RAISE EXCEPTION 'Ordem cancelada. Não é permitido encerrar.';
  END IF;

  IF v_ordem.status = 'concluida' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Ordem já concluída.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.industria_producao_operacoes
    WHERE ordem_id = p_ordem_id AND require_if = true
  ) AND NOT EXISTS (
    SELECT 1 FROM public.industria_qualidade_inspecoes
    WHERE ordem_id = p_ordem_id AND tipo = 'IF' AND resultado = 'aprovada'
  ) THEN
    RAISE EXCEPTION 'Inspeção Final pendente. Aprove ou registre a IF para fechar a ordem.';
  END IF;

  FOR v_comp IN
    SELECT c.*, p.rastreabilidade
      FROM public.industria_producao_componentes c
      JOIN public.produtos p ON p.id = c.produto_id
     WHERE c.ordem_id = p_ordem_id AND c.empresa_id = v_empresa_id
  LOOP
    IF v_ordem.quantidade_planejada > 0 THEN
      v_qtd_necessaria_total := (v_comp.quantidade_planejada / v_ordem.quantidade_planejada) * v_ordem.total_entregue;
    ELSE
      v_qtd_necessaria_total := 0;
    END IF;

    v_qtd_pendente := v_qtd_necessaria_total - v_comp.quantidade_consumida;

    IF v_qtd_pendente > 0.0001 THEN
      FOR v_lote_rec IN
        SELECT * FROM public.estoque_lotes
        WHERE produto_id = v_comp.produto_id AND empresa_id = v_empresa_id AND saldo > 0
        ORDER BY validade ASC NULLS LAST, created_at ASC
      LOOP
        EXIT WHEN v_qtd_pendente <= 0;

        v_consumir_lote := LEAST(v_qtd_pendente, v_lote_rec.saldo);

        UPDATE public.estoque_lotes
           SET saldo = saldo - v_consumir_lote
         WHERE id = v_lote_rec.id;

        INSERT INTO public.estoque_movimentos (
          empresa_id, produto_id, tipo, quantidade,
          saldo_anterior, saldo_novo,
          origem_tipo, origem_id, tipo_mov, lote, observacoes
        ) VALUES (
          v_empresa_id, v_comp.produto_id, 'saida', v_consumir_lote,
          v_lote_rec.saldo, v_lote_rec.saldo - v_consumir_lote,
          'ordem_producao', p_ordem_id, 'consumo_producao_backflush', v_lote_rec.lote,
          'Backflush Fechamento OP ' || v_ordem.numero
        );

        UPDATE public.industria_producao_componentes
           SET quantidade_consumida = quantidade_consumida + v_consumir_lote
         WHERE id = v_comp.id;

        v_qtd_pendente := v_qtd_pendente - v_consumir_lote;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.industria_producao_ordens
     SET status = 'concluida',
         updated_at = now()
   WHERE id = p_ordem_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_producao_fechar(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OP: excluir somente rascunho e sem dependências principais
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_producao_ordens_delete(uuid);
CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_status text;
BEGIN
  SELECT status
    INTO v_status
    FROM public.industria_producao_ordens
   WHERE id = p_id AND empresa_id = v_empresa_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'Somente ordens em rascunho podem ser excluídas.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.industria_producao_operacoes WHERE ordem_id = p_id AND empresa_id = v_empresa_id) THEN
    RAISE EXCEPTION 'Não é possível excluir: a ordem já possui operações.';
  END IF;

  IF to_regclass('public.industria_producao_entregas') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.industria_producao_entregas WHERE ordem_id = p_id AND empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir: a ordem já possui entregas.';
  END IF;

  DELETE FROM public.industria_producao_ordens
   WHERE id = p_id AND empresa_id = v_empresa_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Ordens (OP/OB): impedir edição via upsert quando concluída/cancelada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_upsert_ordem(jsonb);
CREATE OR REPLACE FUNCTION public.industria_upsert_ordem(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
  v_status_atual text;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status
      INTO v_status_atual
      FROM public.industria_ordens
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    UPDATE public.industria_ordens
       SET
         tipo_ordem            = p_payload->>'tipo_ordem',
         produto_final_id      = (p_payload->>'produto_final_id')::uuid,
         quantidade_planejada  = (p_payload->>'quantidade_planejada')::numeric,
         unidade               = p_payload->>'unidade',
         cliente_id            = (p_payload->>'cliente_id')::uuid,
         status                = COALESCE(p_payload->>'status', 'rascunho'),
         prioridade            = COALESCE((p_payload->>'prioridade')::int, 0),
         data_prevista_inicio  = (p_payload->>'data_prevista_inicio')::date,
         data_prevista_fim     = (p_payload->>'data_prevista_fim')::date,
         data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
         documento_ref         = p_payload->>'documento_ref',
         observacoes           = p_payload->>'observacoes',
         usa_material_cliente  = COALESCE((p_payload->>'usa_material_cliente')::boolean, false),
         material_cliente_id   = (p_payload->>'material_cliente_id')::uuid,
         roteiro_aplicado_id   = (p_payload->>'roteiro_aplicado_id')::uuid,
         roteiro_aplicado_desc = p_payload->>'roteiro_aplicado_desc'
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.industria_ordens (
      empresa_id,
      tipo_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      cliente_id,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes,
      usa_material_cliente,
      material_cliente_id,
      roteiro_aplicado_id,
      roteiro_aplicado_desc
    ) VALUES (
      v_empresa_id,
      p_payload->>'tipo_ordem',
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      (p_payload->>'cliente_id')::uuid,
      COALESCE(p_payload->>'status', 'rascunho'),
      COALESCE((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      COALESCE((p_payload->>'usa_material_cliente')::boolean, false),
      (p_payload->>'material_cliente_id')::uuid,
      (p_payload->>'roteiro_aplicado_id')::uuid,
      p_payload->>'roteiro_aplicado_desc'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  RETURN public.industria_get_ordem_details(v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem(jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Execução: impedir atualizar/apontar operação se a ordem (produção) estiver concluída/cancelada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_operacao_update_status(uuid, text, int, uuid);
CREATE OR REPLACE FUNCTION public.industria_operacao_update_status(
  p_id uuid,
  p_status text,
  p_prioridade int DEFAULT NULL,
  p_centro_trabalho_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_ordem_id uuid;
  v_ordem_status text;
BEGIN
  SELECT op.ordem_id, o.status
    INTO v_ordem_id, v_ordem_status
    FROM public.industria_producao_operacoes op
    JOIN public.industria_producao_ordens o ON o.id = op.ordem_id
   WHERE op.id = p_id
     AND op.empresa_id = v_emp
     AND o.empresa_id = v_emp;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'Operação não encontrada.';
  END IF;

  IF v_ordem_status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Operação não pode ser alterada: ordem está %.', v_ordem_status;
  END IF;

  UPDATE public.industria_producao_operacoes
     SET status = p_status,
         centro_trabalho_id = COALESCE(p_centro_trabalho_id, centro_trabalho_id),
         updated_at = now()
   WHERE id = p_id
     AND empresa_id = v_emp;

  IF p_prioridade IS NOT NULL THEN
    UPDATE public.industria_producao_ordens
       SET prioridade = p_prioridade,
           updated_at = now()
     WHERE id = v_ordem_id
       AND empresa_id = v_emp
       AND status NOT IN ('concluida', 'cancelada');
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_operacao_update_status id='||p_id||' status='||p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_operacao_update_status(uuid, text, int, uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text);
CREATE OR REPLACE FUNCTION public.industria_operacao_apontar_execucao(
  p_operacao_id uuid,
  p_acao text,
  p_qtd_boas numeric DEFAULT 0,
  p_qtd_refugadas numeric DEFAULT 0,
  p_motivo_refugo text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
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

    INSERT INTO public.industria_producao_apontamentos (
      empresa_id, operacao_id, quantidade_boa, quantidade_refugo, motivo_refugo, observacoes, tipo
    ) VALUES (
      v_emp, p_operacao_id, COALESCE(p_qtd_boas,0), COALESCE(p_qtd_refugadas,0), p_motivo_refugo, p_observacoes, 'conclusao'
    );

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

  PERFORM pg_notify('app_log', '[RPC] industria_operacao_apontar_execucao op='||p_operacao_id||' acao='||p_acao);
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) TO authenticated, service_role;

COMMIT;

