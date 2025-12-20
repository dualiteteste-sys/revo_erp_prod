-- =============================================================================
-- Indústria: trava de cabeçalho após liberação/execução + auditoria
-- - OP (industria_producao_ordens): não permite alterar produto/quantidade/unidade após operações geradas
-- - OP/OB (industria_ordens): não permite alterar produto/quantidade/unidade/cliente após execução ser gerada
-- - Auditoria: habilita audit_logs_trigger em tabelas críticas de indústria (se existirem)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- OP (Produção): trava produto/qtd/unidade após operações geradas
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
  v_old_produto uuid;
  v_old_qtd numeric;
  v_old_unidade text;
  v_old_roteiro uuid;
  v_old_bom uuid;
  v_has_ops boolean := false;
  v_new_produto uuid;
  v_new_qtd numeric;
  v_new_unidade text;
  v_new_roteiro uuid;
  v_new_bom uuid;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status, produto_final_id, quantidade_planejada, unidade, roteiro_aplicado_id, bom_aplicado_id
      INTO v_status_atual, v_old_produto, v_old_qtd, v_old_unidade, v_old_roteiro, v_old_bom
      FROM public.industria_producao_ordens
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    SELECT EXISTS(
      SELECT 1
        FROM public.industria_producao_operacoes
       WHERE ordem_id = (p_payload->>'id')::uuid
         AND empresa_id = v_empresa_id
    ) INTO v_has_ops;

    IF v_has_ops THEN
      IF (p_payload ? 'produto_final_id') THEN
        v_new_produto := (p_payload->>'produto_final_id')::uuid;
        IF v_new_produto IS DISTINCT FROM v_old_produto THEN
          RAISE EXCEPTION 'Não é permitido alterar o produto após a liberação (operações já geradas).';
        END IF;
      END IF;

      IF (p_payload ? 'quantidade_planejada') THEN
        v_new_qtd := (p_payload->>'quantidade_planejada')::numeric;
        IF v_new_qtd IS DISTINCT FROM v_old_qtd THEN
          RAISE EXCEPTION 'Não é permitido alterar a quantidade após a liberação (operações já geradas).';
        END IF;
      END IF;

      IF (p_payload ? 'unidade') THEN
        v_new_unidade := p_payload->>'unidade';
        IF v_new_unidade IS DISTINCT FROM v_old_unidade THEN
          RAISE EXCEPTION 'Não é permitido alterar a unidade após a liberação (operações já geradas).';
        END IF;
      END IF;

      IF (p_payload ? 'roteiro_aplicado_id') THEN
        v_new_roteiro := (p_payload->>'roteiro_aplicado_id')::uuid;
        IF v_new_roteiro IS DISTINCT FROM v_old_roteiro THEN
          RAISE EXCEPTION 'Não é permitido alterar o roteiro após a liberação (operações já geradas).';
        END IF;
      END IF;

      IF (p_payload ? 'bom_aplicado_id') THEN
        v_new_bom := (p_payload->>'bom_aplicado_id')::uuid;
        IF v_new_bom IS DISTINCT FROM v_old_bom THEN
          RAISE EXCEPTION 'Não é permitido alterar a BOM após a liberação (operações já geradas).';
        END IF;
      END IF;
    END IF;

    UPDATE public.industria_producao_ordens
       SET
         origem_ordem         = COALESCE(p_payload->>'origem_ordem', origem_ordem, 'manual'),
         produto_final_id     = CASE WHEN v_has_ops THEN produto_final_id ELSE COALESCE((p_payload->>'produto_final_id')::uuid, produto_final_id) END,
         quantidade_planejada = CASE WHEN v_has_ops THEN quantidade_planejada ELSE COALESCE((p_payload->>'quantidade_planejada')::numeric, quantidade_planejada) END,
         unidade              = CASE WHEN v_has_ops THEN unidade ELSE COALESCE(p_payload->>'unidade', unidade) END,
         status               = COALESCE(p_payload->>'status', status, 'rascunho'),
         prioridade           = COALESCE((p_payload->>'prioridade')::int, prioridade, 0),
         data_prevista_inicio = COALESCE((p_payload->>'data_prevista_inicio')::date, data_prevista_inicio),
         data_prevista_fim    = COALESCE((p_payload->>'data_prevista_fim')::date, data_prevista_fim),
         data_prevista_entrega = COALESCE((p_payload->>'data_prevista_entrega')::date, data_prevista_entrega),
         documento_ref        = COALESCE(p_payload->>'documento_ref', documento_ref),
         observacoes          = COALESCE(p_payload->>'observacoes', observacoes),
         roteiro_aplicado_id        = CASE WHEN v_has_ops THEN roteiro_aplicado_id ELSE COALESCE((p_payload->>'roteiro_aplicado_id')::uuid, roteiro_aplicado_id) END,
         roteiro_aplicado_desc      = CASE WHEN v_has_ops THEN roteiro_aplicado_desc ELSE COALESCE(p_payload->>'roteiro_aplicado_desc', roteiro_aplicado_desc) END,
         bom_aplicado_id            = CASE WHEN v_has_ops THEN bom_aplicado_id ELSE COALESCE((p_payload->>'bom_aplicado_id')::uuid, bom_aplicado_id) END,
         bom_aplicado_desc          = CASE WHEN v_has_ops THEN bom_aplicado_desc ELSE COALESCE(p_payload->>'bom_aplicado_desc', bom_aplicado_desc) END,
         lote_producao              = COALESCE(p_payload->>'lote_producao', lote_producao),
         reserva_modo               = COALESCE(p_payload->>'reserva_modo', reserva_modo, 'ao_liberar'),
         tolerancia_overrun_percent = COALESCE((p_payload->>'tolerancia_overrun_percent')::numeric, tolerancia_overrun_percent, 0)
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
-- OP/OB (indústria): trava cabeçalho após execução gerada
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
  v_execucao_id uuid;
  v_old_produto uuid;
  v_old_qtd numeric;
  v_old_unidade text;
  v_old_cliente uuid;
  v_old_tipo text;
  v_old_roteiro uuid;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status, execucao_ordem_id, produto_final_id, quantidade_planejada, unidade, cliente_id, tipo_ordem, roteiro_aplicado_id
      INTO v_status_atual, v_execucao_id, v_old_produto, v_old_qtd, v_old_unidade, v_old_cliente, v_old_tipo, v_old_roteiro
      FROM public.industria_ordens
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    IF v_execucao_id IS NOT NULL THEN
      IF (p_payload ? 'produto_final_id') AND (p_payload->>'produto_final_id')::uuid IS DISTINCT FROM v_old_produto THEN
        RAISE EXCEPTION 'Não é permitido alterar o produto após gerar a Execução.';
      END IF;
      IF (p_payload ? 'quantidade_planejada') AND (p_payload->>'quantidade_planejada')::numeric IS DISTINCT FROM v_old_qtd THEN
        RAISE EXCEPTION 'Não é permitido alterar a quantidade após gerar a Execução.';
      END IF;
      IF (p_payload ? 'unidade') AND (p_payload->>'unidade') IS DISTINCT FROM v_old_unidade THEN
        RAISE EXCEPTION 'Não é permitido alterar a unidade após gerar a Execução.';
      END IF;
      IF (p_payload ? 'cliente_id') AND (p_payload->>'cliente_id')::uuid IS DISTINCT FROM v_old_cliente THEN
        RAISE EXCEPTION 'Não é permitido alterar o cliente após gerar a Execução.';
      END IF;
      IF (p_payload ? 'tipo_ordem') AND (p_payload->>'tipo_ordem') IS DISTINCT FROM v_old_tipo THEN
        RAISE EXCEPTION 'Não é permitido alterar o tipo da ordem após gerar a Execução.';
      END IF;
      IF (p_payload ? 'roteiro_aplicado_id') AND (p_payload->>'roteiro_aplicado_id')::uuid IS DISTINCT FROM v_old_roteiro THEN
        RAISE EXCEPTION 'Não é permitido alterar o roteiro após gerar a Execução.';
      END IF;
    END IF;

    UPDATE public.industria_ordens
       SET
         tipo_ordem            = CASE WHEN v_execucao_id IS NOT NULL THEN tipo_ordem ELSE p_payload->>'tipo_ordem' END,
         produto_final_id      = CASE WHEN v_execucao_id IS NOT NULL THEN produto_final_id ELSE COALESCE((p_payload->>'produto_final_id')::uuid, produto_final_id) END,
         quantidade_planejada  = CASE WHEN v_execucao_id IS NOT NULL THEN quantidade_planejada ELSE COALESCE((p_payload->>'quantidade_planejada')::numeric, quantidade_planejada) END,
         unidade               = CASE WHEN v_execucao_id IS NOT NULL THEN unidade ELSE COALESCE(p_payload->>'unidade', unidade) END,
         cliente_id            = CASE WHEN v_execucao_id IS NOT NULL THEN cliente_id ELSE (p_payload->>'cliente_id')::uuid END,
         status                = COALESCE(p_payload->>'status', status, 'rascunho'),
         prioridade            = COALESCE((p_payload->>'prioridade')::int, prioridade, 0),
         data_prevista_inicio  = COALESCE((p_payload->>'data_prevista_inicio')::date, data_prevista_inicio),
         data_prevista_fim     = COALESCE((p_payload->>'data_prevista_fim')::date, data_prevista_fim),
         data_prevista_entrega = COALESCE((p_payload->>'data_prevista_entrega')::date, data_prevista_entrega),
         documento_ref         = COALESCE(p_payload->>'documento_ref', documento_ref),
         observacoes           = COALESCE(p_payload->>'observacoes', observacoes),
         usa_material_cliente  = COALESCE((p_payload->>'usa_material_cliente')::boolean, usa_material_cliente, false),
         material_cliente_id   = COALESCE((p_payload->>'material_cliente_id')::uuid, material_cliente_id),
         roteiro_aplicado_id   = CASE WHEN v_execucao_id IS NOT NULL THEN roteiro_aplicado_id ELSE COALESCE((p_payload->>'roteiro_aplicado_id')::uuid, roteiro_aplicado_id) END,
         roteiro_aplicado_desc = CASE WHEN v_execucao_id IS NOT NULL THEN roteiro_aplicado_desc ELSE COALESCE(p_payload->>'roteiro_aplicado_desc', roteiro_aplicado_desc) END
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
-- Auditoria: adicionar audit_logs_trigger em tabelas de indústria (se existirem)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR to_regclass('public.process_audit_log') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.industria_ordens') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_ordens';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_ordens FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.industria_ordens_componentes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_ordens_componentes';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_ordens_componentes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.industria_ordens_entregas') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_ordens_entregas';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_ordens_entregas FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.industria_producao_operacoes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_producao_operacoes';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_producao_operacoes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.industria_producao_componentes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_producao_componentes';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_producao_componentes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;

  IF to_regclass('public.industria_producao_entregas') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.industria_producao_entregas';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.industria_producao_entregas FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END;
$$;

COMMIT;

