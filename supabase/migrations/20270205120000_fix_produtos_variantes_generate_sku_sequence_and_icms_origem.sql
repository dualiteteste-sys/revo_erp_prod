/*
  Fix: produtos_variantes_generate_for_current_user

  Problemas corrigidos:
  1) 23502: insert de variação não preenchia `icms_origem` (NOT NULL).
  2) Modo numérico de SKU colidia com SKUs já existentes do mesmo pai e acabava
     "reutilizando" a variação existente (overwrite) em vez de continuar a numeração.

  Estratégia:
  - Idempotência por (atributo_id + valor_text) dentro do mesmo produto pai: se a variação já existe,
    atualiza nome/campos e mantém o SKU atual.
  - Para `p_sku_suffix_mode = 'num'`: calcula o próximo sufixo a partir do maior `-NN` já existente
    para esse pai e gera sequencialmente sem colidir.
  - Para `p_sku_suffix_mode = 'slug'`: mantém o padrão base + slug, com fallback `-NN` se necessário.
  - Sempre insere `icms_origem = coalesce(v_parent.icms_origem, 0)` para evitar NULL.

  Segurança:
  - SECURITY DEFINER + search_path fixo.
  - Exige permissão `produtos:update`.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.produtos_variantes_generate_for_current_user(
  p_produto_pai_id uuid,
  p_atributo_id uuid,
  p_valores_text text[],
  p_sku_suffix_mode text DEFAULT 'slug' -- 'slug' | 'num'
)
RETURNS TABLE(variant_id uuid, variant_nome text, variant_sku text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_parent public.produtos%rowtype;
  v_val text;
  v_slug text;
  v_nome text;
  v_base_sku text;
  v_base_sku_re text;
  v_candidate_sku text;
  v_variant_id uuid;
  v_existing_id uuid;
  v_existing_sku text;
  v_try int;
  v_seen_slugs text[] := array[]::text[];
  v_next_num int := 1;
  v_suffix int;
BEGIN
  PERFORM public.require_permission_for_current_user('produtos','update');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  IF p_produto_pai_id IS NULL THEN
    RAISE EXCEPTION 'p_produto_pai_id é obrigatório.';
  END IF;
  IF p_atributo_id IS NULL THEN
    RAISE EXCEPTION 'p_atributo_id é obrigatório.';
  END IF;
  IF p_valores_text IS NULL OR array_length(p_valores_text, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos 1 valor.';
  END IF;

  SELECT * INTO v_parent
  FROM public.produtos p
  WHERE p.id = p_produto_pai_id
    AND p.empresa_id = v_empresa;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto pai não encontrado.';
  END IF;

  IF v_parent.tipo = 'servico' THEN
    RAISE EXCEPTION 'Serviços não suportam variações.';
  END IF;

  IF v_parent.produto_pai_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este produto já é uma variação (não pode ser pai).';
  END IF;

  -- Base SKU (sem sufixo)
  IF COALESCE(NULLIF(btrim(v_parent.sku), ''), '') = '' THEN
    v_base_sku := 'VAR' || lpad(v_parent.id::text, 8, '0');
  ELSE
    v_base_sku := btrim(v_parent.sku);
  END IF;

  -- Para modo numérico, começa do maior sufixo já existente (continuidade)
  IF p_sku_suffix_mode = 'num' THEN
    v_base_sku_re := regexp_replace(v_base_sku, '([\\.^$|?*+()\\[\\]{}\\\\-])', '\\\\1', 'g');
    SELECT COALESCE(MAX((right(p.sku, 2))::int), 0) + 1
      INTO v_next_num
    FROM public.produtos p
    WHERE p.empresa_id = v_empresa
      AND p.produto_pai_id = p_produto_pai_id
      AND p.sku ~ ('^' || v_base_sku_re || '-[0-9]{2}$');
  END IF;

  FOREACH v_val IN ARRAY p_valores_text LOOP
    v_val := NULLIF(btrim(v_val), '');
    IF v_val IS NULL THEN
      CONTINUE;
    END IF;

    v_slug := NULLIF(public._slugify_simple(v_val), '');
    IF v_slug IS NULL THEN
      CONTINUE;
    END IF;

    IF v_seen_slugs @> ARRAY[v_slug] THEN
      CONTINUE;
    END IF;
    v_seen_slugs := array_append(v_seen_slugs, v_slug);

    v_nome := v_parent.nome || ' - ' || v_val;

    -- Idempotência por atributo/valor dentro do mesmo pai (não depende de SKU)
    v_existing_id := NULL;
    v_existing_sku := NULL;
    SELECT p.id, p.sku
      INTO v_existing_id, v_existing_sku
    FROM public.produtos p
    JOIN public.produto_atributos pa
      ON pa.empresa_id = p.empresa_id
     AND pa.produto_id = p.id
    WHERE p.empresa_id = v_empresa
      AND p.produto_pai_id = p_produto_pai_id
      AND pa.atributo_id = p_atributo_id
      AND pa.valor_text = v_val
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_variant_id := v_existing_id;
      v_candidate_sku := v_existing_sku;

      UPDATE public.produtos
      SET
        nome = v_nome,
        grupo_id = v_parent.grupo_id,
        status = v_parent.status,
        tipo = v_parent.tipo,
        unidade = v_parent.unidade,
        preco_venda = v_parent.preco_venda,
        descricao = v_parent.descricao,
        icms_origem = COALESCE(v_parent.icms_origem, 0),
        updated_at = now()
      WHERE id = v_variant_id
        AND empresa_id = v_empresa;
    ELSE
      -- Gera SKU único sem sobrescrever variações existentes
      IF p_sku_suffix_mode = 'num' THEN
        v_suffix := v_next_num;
        LOOP
          v_candidate_sku := v_base_sku || '-' || lpad(v_suffix::text, 2, '0');
          PERFORM 1
          FROM public.produtos p
          WHERE p.empresa_id = v_empresa
            AND p.sku = v_candidate_sku
          LIMIT 1;
          IF NOT FOUND THEN
            EXIT;
          END IF;
          v_suffix := v_suffix + 1;
          IF v_suffix > 9999 THEN
            RAISE EXCEPTION 'Não foi possível gerar um SKU numérico único para a variação "%".', v_val;
          END IF;
        END LOOP;
        v_next_num := v_suffix + 1;
      ELSE
        -- slug mode: base + slug (+ -NN se necessário)
        FOR v_try IN 0..99 LOOP
          IF v_try = 0 THEN
            v_candidate_sku := v_base_sku || '-' || v_slug;
          ELSE
            v_candidate_sku := v_base_sku || '-' || v_slug || '-' || lpad(v_try::text, 2, '0');
          END IF;

          PERFORM 1
          FROM public.produtos p
          WHERE p.empresa_id = v_empresa
            AND p.sku = v_candidate_sku
          LIMIT 1;

          IF NOT FOUND THEN
            EXIT;
          END IF;
        END LOOP;

        IF v_candidate_sku IS NULL THEN
          RAISE EXCEPTION 'Não foi possível gerar um SKU único para a variação "%".', v_val;
        END IF;
      END IF;

      INSERT INTO public.produtos (
        empresa_id,
        tipo,
        status,
        nome,
        sku,
        unidade,
        preco_venda,
        moeda,
        icms_origem,
        ncm,
        cest,
        cfop_padrao,
        cst_padrao,
        csosn_padrao,
        tipo_embalagem,
        embalagem,
        peso_liquido_kg,
        peso_bruto_kg,
        num_volumes,
        largura_cm,
        altura_cm,
        comprimento_cm,
        diametro_cm,
        controla_estoque,
        estoque_min,
        estoque_max,
        controlar_lotes,
        localizacao,
        dias_preparacao,
        marca_id,
        tabela_medidas_id,
        produto_pai_id,
        grupo_id,
        descricao,
        descricao_complementar,
        video_url,
        slug,
        seo_titulo,
        seo_descricao,
        keywords,
        permitir_inclusao_vendas,
        gtin,
        gtin_tributavel,
        unidade_tributavel,
        fator_conversao,
        codigo_enquadramento_ipi,
        valor_ipi_fixo,
        codigo_enquadramento_legal_ipi,
        ex_tipi,
        observacoes_internas
      ) VALUES (
        v_empresa,
        v_parent.tipo,
        v_parent.status,
        v_nome,
        v_candidate_sku,
        v_parent.unidade,
        v_parent.preco_venda,
        v_parent.moeda,
        COALESCE(v_parent.icms_origem, 0),
        v_parent.ncm,
        v_parent.cest,
        v_parent.cfop_padrao,
        v_parent.cst_padrao,
        v_parent.csosn_padrao,
        v_parent.tipo_embalagem,
        v_parent.embalagem,
        v_parent.peso_liquido_kg,
        v_parent.peso_bruto_kg,
        v_parent.num_volumes,
        v_parent.largura_cm,
        v_parent.altura_cm,
        v_parent.comprimento_cm,
        v_parent.diametro_cm,
        v_parent.controla_estoque,
        v_parent.estoque_min,
        v_parent.estoque_max,
        v_parent.controlar_lotes,
        v_parent.localizacao,
        v_parent.dias_preparacao,
        v_parent.marca_id,
        v_parent.tabela_medidas_id,
        v_parent.id,
        v_parent.grupo_id,
        v_parent.descricao,
        v_parent.descricao_complementar,
        v_parent.video_url,
        v_parent.slug,
        v_parent.seo_titulo,
        v_parent.seo_descricao,
        v_parent.keywords,
        v_parent.permitir_inclusao_vendas,
        NULLIF(btrim(v_parent.gtin), ''),
        NULLIF(btrim(v_parent.gtin_tributavel), ''),
        v_parent.unidade_tributavel,
        v_parent.fator_conversao,
        v_parent.codigo_enquadramento_ipi,
        v_parent.valor_ipi_fixo,
        v_parent.codigo_enquadramento_legal_ipi,
        v_parent.ex_tipi,
        v_parent.observacoes_internas
      )
      RETURNING id INTO v_variant_id;
    END IF;

    INSERT INTO public.produto_atributos (
      empresa_id,
      produto_id,
      atributo_id,
      valor_text
    ) VALUES (
      v_empresa,
      v_variant_id,
      p_atributo_id,
      v_val
    )
    ON CONFLICT (empresa_id, produto_id, atributo_id) DO UPDATE SET
      valor_text = excluded.valor_text,
      updated_at = now();

    variant_id := v_variant_id;
    variant_nome := v_nome;
    variant_sku := v_candidate_sku;
    RETURN NEXT;

    v_variant_id := NULL;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_variantes_generate_for_current_user(uuid, uuid, text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.produtos_variantes_generate_for_current_user(uuid, uuid, text[], text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

