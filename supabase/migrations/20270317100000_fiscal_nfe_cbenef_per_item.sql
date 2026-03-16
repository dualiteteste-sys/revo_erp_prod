/*
  cBenef per-item: Código de Benefício Fiscal é atributo do ITEM na NF-e (tag cBenef ID I05f).
  Permite override manual por item, com fallback para natureza de operação.

  Alterações:
  1. Adicionar coluna codigo_beneficio_fiscal em fiscal_nfe_emissao_itens
  2. fiscal_nfe_emissao_draft_upsert: persistir cBenef do item
  3. fiscal_nfe_emissao_itens_list: retornar cBenef do item
  4. fiscal_nfe_calcular_impostos: item cBenef > natureza cBenef (override)
*/

-- =========================================================
-- 1. Coluna cBenef per-item
-- =========================================================

ALTER TABLE public.fiscal_nfe_emissao_itens
  ADD COLUMN IF NOT EXISTS codigo_beneficio_fiscal text;

COMMENT ON COLUMN public.fiscal_nfe_emissao_itens.codigo_beneficio_fiscal
  IS 'Código de Benefício Fiscal (cBenef) — override manual por item. Se NULL, usa o da natureza de operação.';


-- =========================================================
-- 2. REWRITE fiscal_nfe_emissao_itens_list (adicionar cBenef)
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
  codigo_beneficio_fiscal text
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
    i.codigo_beneficio_fiscal
  FROM public.fiscal_nfe_emissao_itens i
  WHERE i.empresa_id = v_empresa
    AND i.emissao_id = p_emissao_id
  ORDER BY i.ordem ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_itens_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_itens_list(uuid) TO authenticated, service_role;


-- =========================================================
-- 3. REWRITE fiscal_nfe_emissao_draft_upsert (persistir cBenef per-item)
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
    -- UPDATE existente: aceita rascunho, erro e rejeitada (reseta para rascunho)
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
      AND status IN ('rascunho', 'erro', 'rejeitada');

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

  -- Inserir novos itens (agora com codigo_beneficio_fiscal)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ordem := v_ordem + 1;
    INSERT INTO public.fiscal_nfe_emissao_itens (
      empresa_id, emissao_id, produto_id, descricao, unidade,
      quantidade, valor_unitario, valor_desconto,
      ncm, cfop, cst, csosn, ordem,
      numero_pedido_cliente, numero_item_pedido, informacoes_adicionais,
      codigo_beneficio_fiscal
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
      nullif(btrim(coalesce(v_item->>'codigo_beneficio_fiscal', '')), '')
    );
  END LOOP;

  -- Recalcular totais
  PERFORM public.fiscal_nfe_recalc_totais(v_emissao_id);

  RETURN v_emissao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb, uuid, text, uuid, uuid, text, numeric, numeric, integer, text) TO authenticated, service_role;


-- =========================================================
-- 4. REWRITE fiscal_nfe_calcular_impostos
--    Item-level cBenef override: se item tem codigo_beneficio_fiscal → usar.
--    Se não → usar da natureza de operação (comportamento atual).
-- =========================================================

DROP FUNCTION IF EXISTS public.fiscal_nfe_calcular_impostos(uuid);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_calcular_impostos(
  p_emissao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa    uuid := public.current_empresa_id();
  v_emissao    record;
  v_emitente   record;
  v_dest       record;
  v_nat        record;
  v_item       record;
  v_cfop       text;
  v_base       numeric;
  v_icms_base  numeric;
  v_icms_val   numeric;
  v_pis_base   numeric;
  v_pis_val    numeric;
  v_cof_base   numeric;
  v_cof_val    numeric;
  v_ipi_base   numeric;
  v_ipi_val    numeric;
  v_total_imp  numeric;
  v_impostos   jsonb;
  v_is_intra   boolean;
  v_count      int := 0;
  v_icms_cst   text;
  v_pis_cst    text;
  v_cofins_cst text;
  v_ipi_cst    text;
  v_cbenef     text;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  -- Ler emissão
  SELECT * INTO v_emissao
  FROM public.fiscal_nfe_emissoes
  WHERE id = p_emissao_id AND empresa_id = v_empresa;

  IF v_emissao IS NULL THEN
    RAISE EXCEPTION 'Emissão não encontrada.' USING errcode='42501';
  END IF;

  -- Ler emitente (para CRT e UF)
  SELECT * INTO v_emitente
  FROM public.fiscal_nfe_emitente
  WHERE empresa_id = v_empresa;

  -- Ler destinatário UF (para determinar CFOP intra/inter)
  IF v_emissao.destinatario_pessoa_id IS NOT NULL THEN
    SELECT pe.uf INTO v_dest
    FROM public.pessoa_enderecos pe
    WHERE pe.pessoa_id = v_emissao.destinatario_pessoa_id
    LIMIT 1;
  END IF;

  -- Ler natureza de operação (master)
  IF v_emissao.natureza_operacao_id IS NOT NULL THEN
    SELECT * INTO v_nat
    FROM public.fiscal_naturezas_operacao
    WHERE id = v_emissao.natureza_operacao_id AND empresa_id = v_empresa;
  END IF;

  -- Se não tem natureza, retorna sem calcular
  IF v_nat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Nenhuma natureza de operação definida.');
  END IF;

  -- Normalizar CSTs (strip leading zeros para CSTs de 3 chars como "090"->"90")
  v_icms_cst := regexp_replace(coalesce(v_nat.icms_cst, '00'), '^0(\d{2})$', '\1');
  v_pis_cst := regexp_replace(coalesce(v_nat.pis_cst, '99'), '^0(\d{2})$', '\1');
  v_cofins_cst := regexp_replace(coalesce(v_nat.cofins_cst, '99'), '^0(\d{2})$', '\1');
  v_ipi_cst := CASE WHEN v_nat.ipi_cst IS NOT NULL
    THEN regexp_replace(v_nat.ipi_cst, '^0(\d{2})$', '\1')
    ELSE NULL END;

  -- Determinar intra/inter
  v_is_intra := (v_emitente.endereco_uf IS NOT NULL
    AND v_dest.uf IS NOT NULL
    AND upper(v_emitente.endereco_uf) = upper(v_dest.uf));

  -- Determinar CFOP
  IF v_is_intra THEN
    v_cfop := coalesce(v_nat.cfop_dentro_uf, v_nat.cfop_fora_uf);
  ELSE
    v_cfop := coalesce(v_nat.cfop_fora_uf, v_nat.cfop_dentro_uf);
  END IF;

  -- Iterar itens
  FOR v_item IN
    SELECT *
    FROM public.fiscal_nfe_emissao_itens
    WHERE emissao_id = p_emissao_id AND empresa_id = v_empresa
    ORDER BY ordem
  LOOP
    v_count := v_count + 1;
    v_base := (v_item.quantidade * v_item.valor_unitario) - coalesce(v_item.valor_desconto, 0);
    IF v_base < 0 THEN v_base := 0; END IF;

    -- cBenef: item-level override > natureza-level
    v_cbenef := coalesce(nullif(btrim(v_item.codigo_beneficio_fiscal), ''), v_nat.codigo_beneficio_fiscal);

    -- ICMS
    v_icms_base := v_base;
    IF v_nat.icms_reducao_base > 0 THEN
      v_icms_base := v_base * (1 - v_nat.icms_reducao_base / 100);
    END IF;

    IF coalesce(v_emitente.crt, 3) = 3 THEN
      v_icms_val := v_icms_base * coalesce(v_nat.icms_aliquota, 0) / 100;
    ELSE
      v_icms_val := 0;
    END IF;

    -- PIS
    v_pis_base := v_base;
    v_pis_val := v_pis_base * coalesce(v_nat.pis_aliquota, 0) / 100;

    -- COFINS
    v_cof_base := v_base;
    v_cof_val := v_cof_base * coalesce(v_nat.cofins_aliquota, 0) / 100;

    -- IPI
    v_ipi_base := v_base;
    IF v_nat.ipi_cst IS NOT NULL AND v_nat.ipi_aliquota > 0 THEN
      v_ipi_val := v_ipi_base * v_nat.ipi_aliquota / 100;
    ELSE
      v_ipi_val := 0;
    END IF;

    -- Total: apenas IPI é "por fora"
    v_total_imp := v_ipi_val;

    -- Montar JSONB com cBenef resolvido (item > natureza)
    v_impostos := jsonb_build_object(
      'icms', jsonb_build_object(
        'cst', CASE WHEN coalesce(v_emitente.crt, 3) = 3 THEN v_icms_cst ELSE NULL END,
        'csosn', CASE WHEN coalesce(v_emitente.crt, 3) != 3 THEN coalesce(v_nat.icms_csosn, '102') ELSE NULL END,
        'origem', '0',
        'base_calculo', round(v_icms_base, 2),
        'aliquota', coalesce(v_nat.icms_aliquota, 0),
        'valor', round(v_icms_val, 2),
        'reducao_base', coalesce(v_nat.icms_reducao_base, 0),
        'modalidade_base_calculo', coalesce(v_nat.icms_modalidade_base_calculo, 3),
        'codigo_beneficio_fiscal', v_cbenef
      ),
      'pis', jsonb_build_object(
        'cst', v_pis_cst,
        'base_calculo', round(v_pis_base, 2),
        'aliquota', coalesce(v_nat.pis_aliquota, 0),
        'valor', round(v_pis_val, 2)
      ),
      'cofins', jsonb_build_object(
        'cst', v_cofins_cst,
        'base_calculo', round(v_cof_base, 2),
        'aliquota', coalesce(v_nat.cofins_aliquota, 0),
        'valor', round(v_cof_val, 2)
      ),
      'total', round(v_total_imp, 2)
    );

    -- IPI (opcional)
    IF v_ipi_cst IS NOT NULL THEN
      v_impostos := v_impostos || jsonb_build_object(
        'ipi', jsonb_build_object(
          'cst', v_ipi_cst,
          'base_calculo', round(v_ipi_base, 2),
          'aliquota', coalesce(v_nat.ipi_aliquota, 0),
          'valor', round(v_ipi_val, 2)
        )
      );
    END IF;

    -- Atualizar item com CSTs normalizados
    UPDATE public.fiscal_nfe_emissao_itens SET
      impostos = v_impostos,
      cfop = coalesce(v_cfop, cfop),
      cst = CASE WHEN coalesce(v_emitente.crt, 3) = 3 THEN v_icms_cst ELSE cst END,
      csosn = CASE WHEN coalesce(v_emitente.crt, 3) != 3 THEN coalesce(v_nat.icms_csosn, csosn) ELSE csosn END,
      updated_at = now()
    WHERE id = v_item.id;
  END LOOP;

  -- Recalcular totais
  PERFORM public.fiscal_nfe_recalc_totais(p_emissao_id);

  RETURN jsonb_build_object(
    'ok', true,
    'items_calculated', v_count,
    'cfop_applied', v_cfop,
    'is_intrastate', v_is_intra
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_calcular_impostos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_calcular_impostos(uuid) TO authenticated, service_role;


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
