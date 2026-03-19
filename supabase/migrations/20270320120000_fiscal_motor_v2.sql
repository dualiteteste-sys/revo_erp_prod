/*
  Fiscal 2026 — Parte 1C: Motor Fiscal v2 (per-item engine)

  Precedência por item:
    1. Natureza de operação (defaults)
    2. Regra fiscal mais prioritária (fiscal_regras match por condições)
    3. Defaults do produto (cfop_padrao, cst_padrao, csosn_padrao)
    4. Override manual do item (já gravado em fiscal_nfe_emissao_itens)

  Cada item recebe impostos.explain com rastreabilidade da fonte.
  IBS/CBS calculado somente se empresa_feature_flags.fiscal_ibs_cbs_enabled = true.

  Backward-compatible: sem regras e sem IBS/CBS = resultado idêntico ao Motor v1.
*/

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
  v_empresa     uuid := public.current_empresa_id();
  v_emissao     record;
  v_emitente    record;
  v_dest        record;
  v_nat         record;
  v_item        record;
  v_regra       record;
  v_produto     record;
  v_cfop        text;
  v_cst_final   text;
  v_csosn_final text;
  v_cbenef      text;
  v_base        numeric;
  v_icms_base   numeric;
  v_icms_val    numeric;
  v_icms_aliq   numeric;
  v_icms_red    numeric;
  v_pis_cst     text;
  v_pis_aliq    numeric;
  v_pis_base    numeric;
  v_pis_val     numeric;
  v_cofins_cst  text;
  v_cofins_aliq numeric;
  v_cof_base    numeric;
  v_cof_val     numeric;
  v_ipi_cst     text;
  v_ipi_aliq    numeric;
  v_ipi_base    numeric;
  v_ipi_val     numeric;
  v_total_imp   numeric;
  v_impostos    jsonb;
  v_explain     jsonb;
  v_is_intra    boolean;
  v_count       int := 0;
  v_is_normal   boolean;
  v_ibs_enabled boolean := false;
  v_ibs_cst     text;
  v_ibs_aliq    numeric;
  v_cbs_aliq    numeric;
  v_c_class     text;
  v_cfop_src    text;
  v_cst_src     text;
  v_regra_id    uuid;
  v_regra_nome  text;
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

  v_is_normal := coalesce(v_emitente.crt, 3) = 3;

  -- Verificar se IBS/CBS está habilitado
  SELECT coalesce(ef.fiscal_ibs_cbs_enabled, false) INTO v_ibs_enabled
  FROM public.empresa_feature_flags ef
  WHERE ef.empresa_id = v_empresa;

  -- Ler destinatário UF
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

  IF v_nat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Nenhuma natureza de operação definida.');
  END IF;

  -- Determinar intra/inter
  v_is_intra := (v_emitente.endereco_uf IS NOT NULL
    AND v_dest.uf IS NOT NULL
    AND upper(v_emitente.endereco_uf) = upper(v_dest.uf));

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

    -- ===== LAYER 1: Natureza defaults =====
    IF v_is_intra THEN
      v_cfop := coalesce(v_nat.cfop_dentro_uf, v_nat.cfop_fora_uf);
    ELSE
      v_cfop := coalesce(v_nat.cfop_fora_uf, v_nat.cfop_dentro_uf);
    END IF;
    v_cfop_src    := 'natureza';
    v_cst_src     := 'natureza';
    v_cst_final   := v_nat.icms_cst;
    v_csosn_final := v_nat.icms_csosn;
    v_cbenef      := v_nat.codigo_beneficio_fiscal;
    v_icms_aliq   := coalesce(v_nat.icms_aliquota, 0);
    v_icms_red    := coalesce(v_nat.icms_reducao_base, 0);
    v_pis_cst     := coalesce(v_nat.pis_cst, '99');
    v_pis_aliq    := coalesce(v_nat.pis_aliquota, 0);
    v_cofins_cst  := coalesce(v_nat.cofins_cst, '99');
    v_cofins_aliq := coalesce(v_nat.cofins_aliquota, 0);
    v_ipi_cst     := v_nat.ipi_cst;
    v_ipi_aliq    := coalesce(v_nat.ipi_aliquota, 0);
    v_regra_id    := NULL;
    v_regra_nome  := NULL;
    -- IBS/CBS defaults from natureza
    v_ibs_cst     := v_nat.ibs_cst_padrao;
    v_ibs_aliq    := coalesce(v_nat.ibs_aliquota_padrao, 0);
    v_cbs_aliq    := coalesce(v_nat.cbs_aliquota_padrao, 0);
    v_c_class     := v_nat.c_class_trib_padrao;

    -- ===== LAYER 2: Regra fiscal match =====
    -- Buscar regra mais prioritária que match as condições deste item
    SELECT r.* INTO v_regra
    FROM public.fiscal_regras r
    WHERE r.empresa_id = v_empresa
      AND r.ativo = true
      -- Condição: grupo do produto
      AND (r.condicao_produto_grupo_id IS NULL
        OR (v_item.produto_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.produtos p2
              WHERE p2.id = v_item.produto_id AND p2.grupo_id = r.condicao_produto_grupo_id
            )))
      -- Condição: NCM pattern
      AND (r.condicao_ncm_pattern IS NULL
        OR coalesce(v_item.ncm, '') LIKE r.condicao_ncm_pattern)
      -- Condição: UF destinatário
      AND (r.condicao_destinatario_uf IS NULL
        OR upper(coalesce(v_dest.uf, '')) = upper(r.condicao_destinatario_uf))
      -- Condição: tipo operação
      AND (r.condicao_tipo_operacao IS NULL
        OR v_nat.tipo_operacao = r.condicao_tipo_operacao)
      -- Condição: regime tributário
      AND (r.condicao_regime IS NULL
        OR (r.condicao_regime = 'normal' AND v_is_normal)
        OR (r.condicao_regime = 'simples' AND NOT v_is_normal))
    ORDER BY r.prioridade ASC
    LIMIT 1;

    IF v_regra IS NOT NULL THEN
      v_regra_id   := v_regra.id;
      v_regra_nome := v_regra.nome;
      -- Overlay campos não-nulos da regra
      IF v_regra.cfop_dentro_uf IS NOT NULL OR v_regra.cfop_fora_uf IS NOT NULL THEN
        IF v_is_intra THEN
          v_cfop := coalesce(v_regra.cfop_dentro_uf, v_regra.cfop_fora_uf, v_cfop);
        ELSE
          v_cfop := coalesce(v_regra.cfop_fora_uf, v_regra.cfop_dentro_uf, v_cfop);
        END IF;
        v_cfop_src := 'regra_fiscal';
      END IF;
      IF v_regra.icms_cst IS NOT NULL THEN v_cst_final := v_regra.icms_cst; v_cst_src := 'regra_fiscal'; END IF;
      IF v_regra.icms_csosn IS NOT NULL THEN v_csosn_final := v_regra.icms_csosn; v_cst_src := 'regra_fiscal'; END IF;
      IF v_regra.icms_aliquota IS NOT NULL THEN v_icms_aliq := v_regra.icms_aliquota; END IF;
      IF v_regra.icms_reducao_base IS NOT NULL THEN v_icms_red := v_regra.icms_reducao_base; END IF;
      IF v_regra.codigo_beneficio_fiscal IS NOT NULL THEN v_cbenef := v_regra.codigo_beneficio_fiscal; END IF;
      IF v_regra.pis_cst IS NOT NULL THEN v_pis_cst := v_regra.pis_cst; END IF;
      IF v_regra.pis_aliquota IS NOT NULL THEN v_pis_aliq := v_regra.pis_aliquota; END IF;
      IF v_regra.cofins_cst IS NOT NULL THEN v_cofins_cst := v_regra.cofins_cst; END IF;
      IF v_regra.cofins_aliquota IS NOT NULL THEN v_cofins_aliq := v_regra.cofins_aliquota; END IF;
      IF v_regra.ipi_cst IS NOT NULL THEN v_ipi_cst := v_regra.ipi_cst; END IF;
      IF v_regra.ipi_aliquota IS NOT NULL THEN v_ipi_aliq := v_regra.ipi_aliquota; END IF;
      -- IBS/CBS da regra
      IF v_regra.ibs_cst IS NOT NULL THEN v_ibs_cst := v_regra.ibs_cst; END IF;
      IF v_regra.ibs_aliquota IS NOT NULL THEN v_ibs_aliq := v_regra.ibs_aliquota; END IF;
      IF v_regra.cbs_aliquota IS NOT NULL THEN v_cbs_aliq := v_regra.cbs_aliquota; END IF;
      IF v_regra.c_class_trib IS NOT NULL THEN v_c_class := v_regra.c_class_trib; END IF;
    END IF;

    -- ===== LAYER 3: Produto defaults (cfop/cst/csosn apenas) =====
    IF v_item.produto_id IS NOT NULL THEN
      SELECT p.cfop_padrao, p.cst_padrao, p.csosn_padrao
      INTO v_produto
      FROM public.produtos p
      WHERE p.id = v_item.produto_id;

      IF v_produto IS NOT NULL THEN
        IF v_produto.cfop_padrao IS NOT NULL AND btrim(v_produto.cfop_padrao) != '' THEN
          v_cfop := v_produto.cfop_padrao;
          v_cfop_src := 'produto';
        END IF;
        IF v_is_normal AND v_produto.cst_padrao IS NOT NULL AND btrim(v_produto.cst_padrao) != '' THEN
          v_cst_final := v_produto.cst_padrao;
          v_cst_src := 'produto';
        END IF;
        IF NOT v_is_normal AND v_produto.csosn_padrao IS NOT NULL AND btrim(v_produto.csosn_padrao) != '' THEN
          v_csosn_final := v_produto.csosn_padrao;
          v_cst_src := 'produto';
        END IF;
      END IF;
    END IF;

    -- ===== LAYER 4: Override manual do item =====
    -- Se o item já tem cfop/cst/csosn/cBenef gravados manualmente, prevalece
    IF v_item.cfop IS NOT NULL AND btrim(v_item.cfop) != '' THEN
      v_cfop := v_item.cfop;
      v_cfop_src := 'manual';
    END IF;
    IF v_is_normal AND v_item.cst IS NOT NULL AND btrim(v_item.cst) != '' THEN
      v_cst_final := v_item.cst;
      v_cst_src := 'manual';
    END IF;
    IF NOT v_is_normal AND v_item.csosn IS NOT NULL AND btrim(v_item.csosn) != '' THEN
      v_csosn_final := v_item.csosn;
      v_cst_src := 'manual';
    END IF;
    IF v_item.codigo_beneficio_fiscal IS NOT NULL AND btrim(v_item.codigo_beneficio_fiscal) != '' THEN
      v_cbenef := v_item.codigo_beneficio_fiscal;
    END IF;
    -- IBS/CBS manual overrides
    IF v_item.ibs_cst IS NOT NULL THEN v_ibs_cst := v_item.ibs_cst; END IF;
    IF v_item.ibs_aliquota IS NOT NULL THEN v_ibs_aliq := v_item.ibs_aliquota; END IF;
    IF v_item.cbs_aliquota IS NOT NULL THEN v_cbs_aliq := v_item.cbs_aliquota; END IF;
    IF v_item.c_class_trib IS NOT NULL THEN v_c_class := v_item.c_class_trib; END IF;

    -- ===== CÁLCULO DE IMPOSTOS =====

    -- ICMS
    v_icms_base := v_base;
    IF v_icms_red > 0 THEN
      v_icms_base := v_base * (1 - v_icms_red / 100);
    END IF;
    IF v_is_normal THEN
      v_icms_val := v_icms_base * v_icms_aliq / 100;
    ELSE
      v_icms_val := 0;
    END IF;

    -- PIS
    v_pis_base := v_base;
    v_pis_val := v_pis_base * v_pis_aliq / 100;

    -- COFINS
    v_cof_base := v_base;
    v_cof_val := v_cof_base * v_cofins_aliq / 100;

    -- IPI
    v_ipi_base := v_base;
    IF v_ipi_cst IS NOT NULL AND v_ipi_aliq > 0 THEN
      v_ipi_val := v_ipi_base * v_ipi_aliq / 100;
    ELSE
      v_ipi_val := 0;
    END IF;

    -- Total: PIS/COFINS/ICMS já inclusos no valor do produto
    v_total_imp := v_ipi_val;

    -- Explain
    v_explain := jsonb_build_object(
      'cfop_source', v_cfop_src,
      'cst_source', v_cst_src,
      'regra_aplicada_id', v_regra_id,
      'regra_aplicada_nome', v_regra_nome
    );

    -- Montar JSONB impostos
    v_impostos := jsonb_build_object(
      'icms', jsonb_build_object(
        'cst', CASE WHEN v_is_normal THEN coalesce(v_cst_final, '00') ELSE NULL END,
        'csosn', CASE WHEN NOT v_is_normal THEN coalesce(v_csosn_final, '102') ELSE NULL END,
        'origem', '0',
        'base_calculo', round(v_icms_base, 2),
        'aliquota', v_icms_aliq,
        'valor', round(v_icms_val, 2),
        'reducao_base', v_icms_red,
        'modalidade_base_calculo', coalesce(v_nat.icms_modalidade_base_calculo, 3),
        'codigo_beneficio_fiscal', v_cbenef
      ),
      'pis', jsonb_build_object(
        'cst', v_pis_cst,
        'base_calculo', round(v_pis_base, 2),
        'aliquota', v_pis_aliq,
        'valor', round(v_pis_val, 2)
      ),
      'cofins', jsonb_build_object(
        'cst', v_cofins_cst,
        'base_calculo', round(v_cof_base, 2),
        'aliquota', v_cofins_aliq,
        'valor', round(v_cof_val, 2)
      ),
      'explain', v_explain,
      'total', round(v_total_imp, 2)
    );

    -- IPI (opcional)
    IF v_ipi_cst IS NOT NULL THEN
      v_impostos := v_impostos || jsonb_build_object(
        'ipi', jsonb_build_object(
          'cst', v_ipi_cst,
          'base_calculo', round(v_ipi_base, 2),
          'aliquota', v_ipi_aliq,
          'valor', round(v_ipi_val, 2)
        )
      );
    END IF;

    -- IBS/CBS (opcional, feature-gated)
    IF v_ibs_enabled AND (v_ibs_cst IS NOT NULL OR v_ibs_aliq > 0 OR v_cbs_aliq > 0) THEN
      v_impostos := v_impostos || jsonb_build_object(
        'ibs_cbs', jsonb_build_object(
          'ibs_cst', v_ibs_cst,
          'ibs_aliquota', coalesce(v_ibs_aliq, 0),
          'ibs_base_calculo', round(v_base, 2),
          'ibs_valor', round(v_base * coalesce(v_ibs_aliq, 0) / 100, 2),
          'cbs_aliquota', coalesce(v_cbs_aliq, 0),
          'cbs_base_calculo', round(v_base, 2),
          'cbs_valor', round(v_base * coalesce(v_cbs_aliq, 0) / 100, 2),
          'c_class_trib', v_c_class
        )
      );
    END IF;

    -- Atualizar item
    UPDATE public.fiscal_nfe_emissao_itens SET
      impostos     = v_impostos,
      cfop         = v_cfop,
      cst          = CASE WHEN v_is_normal THEN coalesce(v_cst_final, cst) ELSE cst END,
      csosn        = CASE WHEN NOT v_is_normal THEN coalesce(v_csosn_final, csosn) ELSE csosn END,
      ibs_cst      = CASE WHEN v_ibs_enabled THEN v_ibs_cst ELSE ibs_cst END,
      ibs_aliquota = CASE WHEN v_ibs_enabled THEN v_ibs_aliq ELSE ibs_aliquota END,
      cbs_aliquota = CASE WHEN v_ibs_enabled THEN v_cbs_aliq ELSE cbs_aliquota END,
      c_class_trib = CASE WHEN v_ibs_enabled THEN v_c_class ELSE c_class_trib END,
      updated_at   = now()
    WHERE id = v_item.id;
  END LOOP;

  -- Recalcular totais
  PERFORM public.fiscal_nfe_recalc_totais(p_emissao_id);

  RETURN jsonb_build_object(
    'ok', true,
    'items_calculated', v_count,
    'cfop_applied', NULL,  -- v2: CFOP é per-item, não global
    'is_intrastate', v_is_intra,
    'ibs_cbs_enabled', v_ibs_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_calcular_impostos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_calcular_impostos(uuid) TO authenticated, service_role;


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
