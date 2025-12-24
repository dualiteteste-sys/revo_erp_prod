-- =============================================================================
-- Indústria: rastreio de OB a partir de NF-e (XML)
-- - Persiste vínculo da ordem (OB) com item do importador fiscal
-- - Trava mudanças de produto/quantidade/unidade enquanto vinculada, exigindo desvincular explicitamente
-- =============================================================================
BEGIN;

-- 1) Colunas na ordem (OP/OB)
ALTER TABLE public.industria_ordens
  ADD COLUMN IF NOT EXISTS origem_fiscal_nfe_import_id uuid,
  ADD COLUMN IF NOT EXISTS origem_fiscal_nfe_item_id uuid,
  ADD COLUMN IF NOT EXISTS origem_qtd_xml numeric(15,4),
  ADD COLUMN IF NOT EXISTS origem_unidade_xml text;

CREATE INDEX IF NOT EXISTS idx_industria_ordens_origem_nfe_item
  ON public.industria_ordens(origem_fiscal_nfe_item_id);

-- 2) Atualiza RPC industria_upsert_ordem (__unsafe + wrapper) para persistir origem
DROP FUNCTION IF EXISTS public.industria_upsert_ordem(jsonb);
DROP FUNCTION IF EXISTS public.industria_upsert_ordem__unsafe(jsonb);

CREATE OR REPLACE FUNCTION public.industria_upsert_ordem__unsafe(p_payload jsonb)
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
  v_old_origem_item uuid;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT
      status,
      execucao_ordem_id,
      produto_final_id,
      quantidade_planejada,
      unidade,
      cliente_id,
      tipo_ordem,
      roteiro_aplicado_id,
      origem_fiscal_nfe_item_id
    INTO
      v_status_atual,
      v_execucao_id,
      v_old_produto,
      v_old_qtd,
      v_old_unidade,
      v_old_cliente,
      v_old_tipo,
      v_old_roteiro,
      v_old_origem_item
    FROM public.industria_ordens
    WHERE id = (p_payload->>'id')::uuid
      AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    -- Se a ordem tem origem em NF-e, não permitir alteração de produto/quantidade/unidade
    -- a menos que o payload explicitamente "desvincule" (origem_fiscal_nfe_item_id = null).
    IF v_old_origem_item IS NOT NULL THEN
      IF (p_payload ? 'produto_final_id')
        AND (p_payload->>'produto_final_id')::uuid IS DISTINCT FROM v_old_produto
        AND NOT ((p_payload ? 'origem_fiscal_nfe_item_id') AND (p_payload->>'origem_fiscal_nfe_item_id') IS NULL)
      THEN
        RAISE EXCEPTION 'Esta ordem foi criada a partir de uma NF-e. Para alterar o produto, primeiro desvincule a origem da NF.';
      END IF;

      IF (p_payload ? 'quantidade_planejada')
        AND (p_payload->>'quantidade_planejada')::numeric IS DISTINCT FROM v_old_qtd
        AND NOT ((p_payload ? 'origem_fiscal_nfe_item_id') AND (p_payload->>'origem_fiscal_nfe_item_id') IS NULL)
      THEN
        RAISE EXCEPTION 'Esta ordem foi criada a partir de uma NF-e. Para alterar a quantidade, primeiro desvincule a origem da NF.';
      END IF;

      IF (p_payload ? 'unidade')
        AND (p_payload->>'unidade') IS DISTINCT FROM v_old_unidade
        AND NOT ((p_payload ? 'origem_fiscal_nfe_item_id') AND (p_payload->>'origem_fiscal_nfe_item_id') IS NULL)
      THEN
        RAISE EXCEPTION 'Esta ordem foi criada a partir de uma NF-e. Para alterar a unidade, primeiro desvincule a origem da NF.';
      END IF;
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
        RAISE EXCEPTION 'Não é permitido alterar o tipo após gerar a Execução.';
      END IF;
      IF (p_payload ? 'roteiro_aplicado_id') AND (p_payload->>'roteiro_aplicado_id')::uuid IS DISTINCT FROM v_old_roteiro THEN
        RAISE EXCEPTION 'Não é permitido alterar o roteiro após gerar a Execução.';
      END IF;
    END IF;

    UPDATE public.industria_ordens
    SET
      tipo_ordem                 = COALESCE(p_payload->>'tipo_ordem', tipo_ordem),
      produto_final_id           = COALESCE((p_payload->>'produto_final_id')::uuid, produto_final_id),
      quantidade_planejada       = COALESCE((p_payload->>'quantidade_planejada')::numeric, quantidade_planejada),
      unidade                    = COALESCE(p_payload->>'unidade', unidade),
      cliente_id                 = COALESCE((p_payload->>'cliente_id')::uuid, cliente_id),
      status                     = COALESCE(p_payload->>'status', status, 'rascunho'),
      prioridade                 = COALESCE((p_payload->>'prioridade')::int, prioridade, 0),
      data_prevista_inicio       = COALESCE((p_payload->>'data_prevista_inicio')::date, data_prevista_inicio),
      data_prevista_fim          = COALESCE((p_payload->>'data_prevista_fim')::date, data_prevista_fim),
      data_prevista_entrega      = COALESCE((p_payload->>'data_prevista_entrega')::date, data_prevista_entrega),
      documento_ref              = COALESCE(p_payload->>'documento_ref', documento_ref),
      observacoes                = COALESCE(p_payload->>'observacoes', observacoes),
      usa_material_cliente       = COALESCE((p_payload->>'usa_material_cliente')::boolean, usa_material_cliente, false),
      material_cliente_id        = COALESCE((p_payload->>'material_cliente_id')::uuid, material_cliente_id),
      roteiro_aplicado_id        = COALESCE((p_payload->>'roteiro_aplicado_id')::uuid, roteiro_aplicado_id),
      roteiro_aplicado_desc      = COALESCE(p_payload->>'roteiro_aplicado_desc', roteiro_aplicado_desc),
      qtde_caixas                = COALESCE((p_payload->>'qtde_caixas')::numeric, qtde_caixas),
      numero_nf                  = COALESCE(p_payload->>'numero_nf', numero_nf),
      pedido_numero              = COALESCE(p_payload->>'pedido_numero', pedido_numero),
      origem_fiscal_nfe_import_id = CASE
        WHEN (p_payload ? 'origem_fiscal_nfe_import_id') THEN (p_payload->>'origem_fiscal_nfe_import_id')::uuid
        ELSE origem_fiscal_nfe_import_id
      END,
      origem_fiscal_nfe_item_id   = CASE
        WHEN (p_payload ? 'origem_fiscal_nfe_item_id') THEN (p_payload->>'origem_fiscal_nfe_item_id')::uuid
        ELSE origem_fiscal_nfe_item_id
      END,
      origem_qtd_xml              = CASE
        WHEN (p_payload ? 'origem_qtd_xml') THEN (p_payload->>'origem_qtd_xml')::numeric
        ELSE origem_qtd_xml
      END,
      origem_unidade_xml          = CASE
        WHEN (p_payload ? 'origem_unidade_xml') THEN (p_payload->>'origem_unidade_xml')
        ELSE origem_unidade_xml
      END
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
      roteiro_aplicado_desc,
      qtde_caixas,
      numero_nf,
      pedido_numero,
      origem_fiscal_nfe_import_id,
      origem_fiscal_nfe_item_id,
      origem_qtd_xml,
      origem_unidade_xml
    ) VALUES (
      v_empresa_id,
      p_payload->>'tipo_ordem',
      (p_payload->>'produto_final_id')::uuid,
      COALESCE((p_payload->>'quantidade_planejada')::numeric, (p_payload->>'origem_qtd_xml')::numeric),
      COALESCE(p_payload->>'unidade', p_payload->>'origem_unidade_xml'),
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
      p_payload->>'roteiro_aplicado_desc',
      (p_payload->>'qtde_caixas')::numeric,
      p_payload->>'numero_nf',
      p_payload->>'pedido_numero',
      (p_payload->>'origem_fiscal_nfe_import_id')::uuid,
      (p_payload->>'origem_fiscal_nfe_item_id')::uuid,
      (p_payload->>'origem_qtd_xml')::numeric,
      p_payload->>'origem_unidade_xml'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  RETURN public.industria_get_ordem_details(v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.industria_upsert_ordem(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');
  RETURN public.industria_upsert_ordem__unsafe(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_upsert_ordem__unsafe(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem__unsafe(jsonb) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.industria_upsert_ordem(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem(jsonb) TO authenticated, service_role;

COMMIT;

