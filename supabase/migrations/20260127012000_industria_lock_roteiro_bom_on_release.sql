-- =============================================================================
-- Indústria: Trava de Roteiro/BOM após liberação/execução
-- - OP (industria_producao_ordens): não permite alterar roteiro/bom quando já existem operações
-- - OP/OB (industria_ordens): não permite alterar roteiro quando execução já foi gerada
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- OP (Produção): trava roteiro/bom quando já existem operações
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
  v_old_roteiro uuid;
  v_old_bom uuid;
  v_has_ops boolean := false;
  v_new_roteiro uuid;
  v_new_bom uuid;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status, roteiro_aplicado_id, bom_aplicado_id
      INTO v_status_atual, v_old_roteiro, v_old_bom
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
-- OP/OB (indústria): trava roteiro após execução ser gerada
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
  v_old_roteiro uuid;
  v_new_roteiro uuid;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status, execucao_ordem_id, roteiro_aplicado_id
      INTO v_status_atual, v_execucao_id, v_old_roteiro
      FROM public.industria_ordens
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    IF v_execucao_id IS NOT NULL AND (p_payload ? 'roteiro_aplicado_id') THEN
      v_new_roteiro := (p_payload->>'roteiro_aplicado_id')::uuid;
      IF v_new_roteiro IS DISTINCT FROM v_old_roteiro THEN
        RAISE EXCEPTION 'Não é permitido alterar o roteiro após gerar a Execução.';
      END IF;
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
         roteiro_aplicado_id   = COALESCE((p_payload->>'roteiro_aplicado_id')::uuid, roteiro_aplicado_id),
         roteiro_aplicado_desc = COALESCE(p_payload->>'roteiro_aplicado_desc', roteiro_aplicado_desc)
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

COMMIT;

