/*
  Fiscal 2026 — Parte 1B: Colunas IBS/CBS
  - Adicionar campos IBS/CBS em fiscal_naturezas_operacao (defaults)
  - Adicionar campos IBS/CBS em fiscal_nfe_emissao_itens (per-item)
  - Adicionar feature flag fiscal_ibs_cbs_enabled em empresa_feature_flags
  - Reescrever RPCs de naturezas para aceitar/retornar novos campos
  - Reescrever RPCs de itens e draft para persistir IBS/CBS
*/

-- =========================================================
-- 1. Colunas IBS/CBS em fiscal_naturezas_operacao
-- =========================================================
ALTER TABLE public.fiscal_naturezas_operacao
  ADD COLUMN IF NOT EXISTS ibs_cst_padrao       text,
  ADD COLUMN IF NOT EXISTS ibs_aliquota_padrao  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbs_aliquota_padrao  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS c_class_trib_padrao  text;


-- =========================================================
-- 2. Colunas IBS/CBS em fiscal_nfe_emissao_itens
-- =========================================================
ALTER TABLE public.fiscal_nfe_emissao_itens
  ADD COLUMN IF NOT EXISTS ibs_cst       text,
  ADD COLUMN IF NOT EXISTS ibs_aliquota  numeric,
  ADD COLUMN IF NOT EXISTS cbs_aliquota  numeric,
  ADD COLUMN IF NOT EXISTS c_class_trib  text;


-- =========================================================
-- 3. Feature flag IBS/CBS
-- =========================================================
ALTER TABLE public.empresa_feature_flags
  ADD COLUMN IF NOT EXISTS fiscal_ibs_cbs_enabled boolean NOT NULL DEFAULT false;


-- =========================================================
-- 4. Rewrite fiscal_naturezas_operacao_upsert (aceitar IBS/CBS)
-- =========================================================
DROP FUNCTION IF EXISTS public.fiscal_naturezas_operacao_upsert(jsonb);

CREATE OR REPLACE FUNCTION public.fiscal_naturezas_operacao_upsert(
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid := (p_payload->>'id')::uuid;
  v_result  uuid;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  PERFORM public.assert_empresa_role_at_least('admin');

  IF v_id IS NOT NULL THEN
    UPDATE public.fiscal_naturezas_operacao SET
      codigo              = coalesce(p_payload->>'codigo', codigo),
      descricao           = coalesce(p_payload->>'descricao', descricao),
      cfop_dentro_uf      = p_payload->>'cfop_dentro_uf',
      cfop_fora_uf        = p_payload->>'cfop_fora_uf',
      cfop_secundario_dentro_uf = p_payload->>'cfop_secundario_dentro_uf',
      cfop_secundario_fora_uf   = p_payload->>'cfop_secundario_fora_uf',
      icms_cst            = p_payload->>'icms_cst',
      icms_csosn          = p_payload->>'icms_csosn',
      icms_aliquota       = coalesce((p_payload->>'icms_aliquota')::numeric, 0),
      icms_reducao_base   = coalesce((p_payload->>'icms_reducao_base')::numeric, 0),
      codigo_beneficio_fiscal = p_payload->>'codigo_beneficio_fiscal',
      pis_cst             = coalesce(p_payload->>'pis_cst', '99'),
      pis_aliquota        = coalesce((p_payload->>'pis_aliquota')::numeric, 0),
      cofins_cst          = coalesce(p_payload->>'cofins_cst', '99'),
      cofins_aliquota     = coalesce((p_payload->>'cofins_aliquota')::numeric, 0),
      ipi_cst             = p_payload->>'ipi_cst',
      ipi_aliquota        = coalesce((p_payload->>'ipi_aliquota')::numeric, 0),
      gera_financeiro     = coalesce((p_payload->>'gera_financeiro')::boolean, true),
      movimenta_estoque   = coalesce((p_payload->>'movimenta_estoque')::boolean, true),
      finalidade_emissao  = coalesce(p_payload->>'finalidade_emissao', '1'),
      tipo_operacao       = coalesce(p_payload->>'tipo_operacao', 'saida'),
      observacoes_padrao  = p_payload->>'observacoes_padrao',
      regime_aplicavel    = coalesce(p_payload->>'regime_aplicavel', 'ambos'),
      ativo               = coalesce((p_payload->>'ativo')::boolean, true),
      -- IBS/CBS 2026
      ibs_cst_padrao      = p_payload->>'ibs_cst_padrao',
      ibs_aliquota_padrao = coalesce((p_payload->>'ibs_aliquota_padrao')::numeric, 0),
      cbs_aliquota_padrao = coalesce((p_payload->>'cbs_aliquota_padrao')::numeric, 0),
      c_class_trib_padrao = p_payload->>'c_class_trib_padrao'
    WHERE id = v_id
      AND empresa_id = v_empresa
    RETURNING id INTO v_result;

    IF v_result IS NULL THEN
      RAISE EXCEPTION 'Natureza de operação não encontrada ou sem permissão.' USING errcode='42501';
    END IF;
  ELSE
    INSERT INTO public.fiscal_naturezas_operacao (
      empresa_id, codigo, descricao,
      cfop_dentro_uf, cfop_fora_uf,
      cfop_secundario_dentro_uf, cfop_secundario_fora_uf,
      icms_cst, icms_csosn, icms_aliquota, icms_reducao_base,
      codigo_beneficio_fiscal,
      pis_cst, pis_aliquota,
      cofins_cst, cofins_aliquota,
      ipi_cst, ipi_aliquota,
      gera_financeiro, movimenta_estoque, finalidade_emissao, tipo_operacao,
      observacoes_padrao, regime_aplicavel, ativo,
      ibs_cst_padrao, ibs_aliquota_padrao, cbs_aliquota_padrao, c_class_trib_padrao
    ) VALUES (
      v_empresa,
      coalesce(p_payload->>'codigo', 'N/A'),
      coalesce(p_payload->>'descricao', 'Nova Natureza'),
      p_payload->>'cfop_dentro_uf',
      p_payload->>'cfop_fora_uf',
      p_payload->>'cfop_secundario_dentro_uf',
      p_payload->>'cfop_secundario_fora_uf',
      p_payload->>'icms_cst',
      p_payload->>'icms_csosn',
      coalesce((p_payload->>'icms_aliquota')::numeric, 0),
      coalesce((p_payload->>'icms_reducao_base')::numeric, 0),
      p_payload->>'codigo_beneficio_fiscal',
      coalesce(p_payload->>'pis_cst', '99'),
      coalesce((p_payload->>'pis_aliquota')::numeric, 0),
      coalesce(p_payload->>'cofins_cst', '99'),
      coalesce((p_payload->>'cofins_aliquota')::numeric, 0),
      p_payload->>'ipi_cst',
      coalesce((p_payload->>'ipi_aliquota')::numeric, 0),
      coalesce((p_payload->>'gera_financeiro')::boolean, true),
      coalesce((p_payload->>'movimenta_estoque')::boolean, true),
      coalesce(p_payload->>'finalidade_emissao', '1'),
      coalesce(p_payload->>'tipo_operacao', 'saida'),
      p_payload->>'observacoes_padrao',
      coalesce(p_payload->>'regime_aplicavel', 'ambos'),
      coalesce((p_payload->>'ativo')::boolean, true),
      p_payload->>'ibs_cst_padrao',
      coalesce((p_payload->>'ibs_aliquota_padrao')::numeric, 0),
      coalesce((p_payload->>'cbs_aliquota_padrao')::numeric, 0),
      p_payload->>'c_class_trib_padrao'
    )
    RETURNING id INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_naturezas_operacao_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_naturezas_operacao_upsert(jsonb) TO authenticated, service_role;


-- =========================================================
-- 5. Rewrite fiscal_naturezas_operacao_search (retornar IBS/CBS + secondary CFOP + cBenef)
-- =========================================================
DROP FUNCTION IF EXISTS public.fiscal_naturezas_operacao_search(text, int);

CREATE OR REPLACE FUNCTION public.fiscal_naturezas_operacao_search(
  p_q     text DEFAULT NULL,
  p_limit int  DEFAULT 15
)
RETURNS TABLE (
  id                        uuid,
  codigo                    text,
  descricao                 text,
  cfop_dentro_uf            text,
  cfop_fora_uf              text,
  cfop_secundario_dentro_uf text,
  cfop_secundario_fora_uf   text,
  icms_cst                  text,
  icms_csosn                text,
  icms_aliquota             numeric,
  icms_reducao_base         numeric,
  codigo_beneficio_fiscal   text,
  pis_cst                   text,
  pis_aliquota              numeric,
  cofins_cst                text,
  cofins_aliquota           numeric,
  ipi_cst                   text,
  ipi_aliquota              numeric,
  finalidade_emissao        text,
  observacoes_padrao        text,
  ibs_cst_padrao            text,
  ibs_aliquota_padrao       numeric,
  cbs_aliquota_padrao       numeric,
  c_class_trib_padrao       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 15), 1), 50);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
    SELECT
      n.id, n.codigo, n.descricao,
      n.cfop_dentro_uf, n.cfop_fora_uf,
      n.cfop_secundario_dentro_uf, n.cfop_secundario_fora_uf,
      n.icms_cst, n.icms_csosn,
      n.icms_aliquota, n.icms_reducao_base,
      n.codigo_beneficio_fiscal,
      n.pis_cst, n.pis_aliquota,
      n.cofins_cst, n.cofins_aliquota,
      n.ipi_cst, n.ipi_aliquota,
      n.finalidade_emissao,
      n.observacoes_padrao,
      n.ibs_cst_padrao, n.ibs_aliquota_padrao,
      n.cbs_aliquota_padrao, n.c_class_trib_padrao
    FROM public.fiscal_naturezas_operacao n
    WHERE n.empresa_id = v_empresa
      AND n.ativo = true
      AND (
        v_q IS NULL
        OR n.descricao ILIKE '%' || v_q || '%'
        OR n.codigo ILIKE '%' || v_q || '%'
        OR n.cfop_dentro_uf ILIKE '%' || v_q || '%'
        OR n.cfop_fora_uf ILIKE '%' || v_q || '%'
      )
    ORDER BY
      CASE WHEN v_q IS NOT NULL AND n.descricao ILIKE v_q || '%' THEN 0 ELSE 1 END,
      n.descricao
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_naturezas_operacao_search(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_naturezas_operacao_search(text, int) TO authenticated, service_role;


-- =========================================================
-- 6. Rewrite fiscal_nfe_emissao_itens_list (retornar IBS/CBS)
-- =========================================================
DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_itens_list(uuid);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_itens_list(
  p_emissao_id uuid
)
RETURNS TABLE(
  id                      uuid,
  produto_id              uuid,
  descricao               text,
  unidade                 text,
  quantidade              numeric,
  valor_unitario          numeric,
  valor_desconto          numeric,
  ncm                     text,
  cfop                    text,
  cst                     text,
  csosn                   text,
  ordem                   int,
  informacoes_adicionais  text,
  numero_pedido_cliente   text,
  numero_item_pedido      int,
  impostos                jsonb,
  codigo_beneficio_fiscal text,
  ibs_cst                 text,
  ibs_aliquota            numeric,
  cbs_aliquota            numeric,
  c_class_trib            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    i.id,
    i.produto_id,
    i.descricao,
    i.unidade,
    i.quantidade,
    i.valor_unitario,
    i.valor_desconto,
    i.ncm,
    i.cfop,
    i.cst,
    i.csosn,
    i.ordem,
    i.informacoes_adicionais,
    i.numero_pedido_cliente,
    i.numero_item_pedido,
    i.impostos,
    i.codigo_beneficio_fiscal,
    i.ibs_cst,
    i.ibs_aliquota,
    i.cbs_aliquota,
    i.c_class_trib
  FROM public.fiscal_nfe_emissao_itens i
  WHERE i.empresa_id = v_empresa
    AND i.emissao_id = p_emissao_id
  ORDER BY i.ordem ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_itens_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_itens_list(uuid) TO authenticated, service_role;


-- =========================================================
-- 7. Rewrite fiscal_nfe_emissao_draft_upsert (persistir IBS/CBS per-item)
-- =========================================================
DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_draft_upsert(
  p_emissao_id              uuid    DEFAULT NULL,
  p_destinatario_pessoa_id  uuid    DEFAULT NULL,
  p_ambiente                text    DEFAULT 'homologacao',
  p_natureza_operacao       text    DEFAULT NULL,
  p_total_frete             numeric DEFAULT 0,
  p_payload                 jsonb   DEFAULT '{}'::jsonb,
  p_items                   jsonb   DEFAULT '[]'::jsonb,
  p_natureza_operacao_id    uuid    DEFAULT NULL,
  p_forma_pagamento         text    DEFAULT NULL,
  p_condicao_pagamento_id   uuid    DEFAULT NULL,
  p_transportadora_id       uuid    DEFAULT NULL,
  p_modalidade_frete        text    DEFAULT '9',
  p_peso_bruto              numeric DEFAULT 0,
  p_peso_liquido            numeric DEFAULT 0,
  p_quantidade_volumes      integer DEFAULT 0,
  p_especie_volumes         text    DEFAULT 'VOLUMES'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa    uuid := public.current_empresa_id();
  v_emissao_id uuid := p_emissao_id;
  v_ambiente   text := coalesce(btrim(p_ambiente), 'homologacao');
  v_nat_op     text := nullif(btrim(coalesce(p_natureza_operacao, '')), '');
  v_nat_op_id  uuid := p_natureza_operacao_id;
  v_frete      numeric := coalesce(p_total_frete, 0);
  v_item       jsonb;
  v_ordem      int := 0;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  IF v_ambiente NOT IN ('homologacao', 'producao') THEN
    RAISE EXCEPTION 'Ambiente inválido.' USING errcode='22023';
  END IF;

  -- Se natureza_operacao_id fornecido, buscar descricao automaticamente
  IF v_nat_op_id IS NOT NULL AND v_nat_op IS NULL THEN
    SELECT n.descricao INTO v_nat_op
    FROM public.fiscal_naturezas_operacao n
    WHERE n.id = v_nat_op_id AND n.empresa_id = v_empresa;
  END IF;

  IF v_emissao_id IS NOT NULL THEN
    -- UPDATE existente: aceita rascunho, em_composicao, com_pendencias, pronta, erro e rejeitada
    UPDATE public.fiscal_nfe_emissoes SET
      status                 = 'rascunho',
      destinatario_pessoa_id = p_destinatario_pessoa_id,
      ambiente               = v_ambiente,
      natureza_operacao      = v_nat_op,
      natureza_operacao_id   = v_nat_op_id,
      total_frete            = v_frete,
      payload                = p_payload,
      forma_pagamento        = p_forma_pagamento,
      condicao_pagamento_id  = p_condicao_pagamento_id,
      transportadora_id      = p_transportadora_id,
      modalidade_frete       = coalesce(p_modalidade_frete, '9'),
      peso_bruto             = coalesce(p_peso_bruto, 0),
      peso_liquido           = coalesce(p_peso_liquido, 0),
      quantidade_volumes     = coalesce(p_quantidade_volumes, 0),
      especie_volumes        = coalesce(nullif(btrim(p_especie_volumes), ''), 'VOLUMES'),
      last_error             = NULL,
      rejection_code         = NULL,
      updated_at             = now()
    WHERE id = v_emissao_id
      AND empresa_id = v_empresa
      AND status IN ('rascunho', 'em_composicao', 'aguardando_validacao', 'com_pendencias', 'pronta', 'erro', 'rejeitada');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NF-e não encontrada ou já em processamento/autorizada.' USING errcode='42501';
    END IF;
  ELSE
    -- INSERT novo rascunho
    INSERT INTO public.fiscal_nfe_emissoes (
      empresa_id, status, ambiente,
      destinatario_pessoa_id,
      natureza_operacao, natureza_operacao_id,
      total_frete, payload,
      forma_pagamento, condicao_pagamento_id,
      transportadora_id, modalidade_frete,
      peso_bruto, peso_liquido,
      quantidade_volumes, especie_volumes
    ) VALUES (
      v_empresa, 'rascunho', v_ambiente,
      p_destinatario_pessoa_id,
      v_nat_op, v_nat_op_id,
      v_frete, p_payload,
      p_forma_pagamento, p_condicao_pagamento_id,
      p_transportadora_id, coalesce(p_modalidade_frete, '9'),
      coalesce(p_peso_bruto, 0), coalesce(p_peso_liquido, 0),
      coalesce(p_quantidade_volumes, 0), coalesce(nullif(btrim(p_especie_volumes), ''), 'VOLUMES')
    )
    RETURNING id INTO v_emissao_id;
  END IF;

  -- Apagar itens antigos
  DELETE FROM public.fiscal_nfe_emissao_itens
  WHERE emissao_id = v_emissao_id AND empresa_id = v_empresa;

  -- Inserir novos itens (com IBS/CBS + cBenef)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ordem := v_ordem + 1;
    INSERT INTO public.fiscal_nfe_emissao_itens (
      empresa_id, emissao_id, produto_id, descricao, unidade,
      quantidade, valor_unitario, valor_desconto,
      ncm, cfop, cst, csosn, ordem,
      numero_pedido_cliente, numero_item_pedido, informacoes_adicionais,
      codigo_beneficio_fiscal,
      ibs_cst, ibs_aliquota, cbs_aliquota, c_class_trib
    ) VALUES (
      v_empresa,
      v_emissao_id,
      (v_item->>'produto_id')::uuid,
      coalesce(v_item->>'descricao', 'Item'),
      coalesce(v_item->>'unidade', 'un'),
      coalesce((v_item->>'quantidade')::numeric, 1),
      coalesce((v_item->>'valor_unitario')::numeric, 0),
      coalesce((v_item->>'valor_desconto')::numeric, 0),
      v_item->>'ncm',
      v_item->>'cfop',
      v_item->>'cst',
      v_item->>'csosn',
      v_ordem,
      v_item->>'numero_pedido_cliente',
      (v_item->>'numero_item_pedido')::integer,
      v_item->>'informacoes_adicionais',
      nullif(btrim(coalesce(v_item->>'codigo_beneficio_fiscal', '')), ''),
      v_item->>'ibs_cst',
      (v_item->>'ibs_aliquota')::numeric,
      (v_item->>'cbs_aliquota')::numeric,
      v_item->>'c_class_trib'
    );
  END LOOP;

  -- Recalcular totais
  PERFORM public.fiscal_nfe_recalc_totais(v_emissao_id);

  RETURN v_emissao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text) TO authenticated, service_role;


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
