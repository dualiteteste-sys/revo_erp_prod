-- Marketplace Phase 1: Adequação de Produtos para Marketplaces
-- Adiciona campos obrigatórios (condição, país de origem, fabricante, modelo, preço promocional),
-- enriquece produto_anúncios para gestão de canais, e atualiza RPCs de produto com colunas novas.
-- Também adiciona RPCs CRUD para marcas e anúncios, e hierarquia recursiva em grupos.

-- =====================================================================
-- 1. NOVAS COLUNAS EM PRODUTOS
-- =====================================================================

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS condicao text NOT NULL DEFAULT 'novo';

DO $$ BEGIN
  ALTER TABLE public.produtos ADD CONSTRAINT ck_produto_condicao
    CHECK (condicao IN ('novo','usado','recondicionado')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.produtos VALIDATE CONSTRAINT ck_produto_condicao;

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS pais_origem text DEFAULT 'BR';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS fabricante text;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS modelo text;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS preco_promocional numeric(14,2);

-- =====================================================================
-- 2. ENRIQUECIMENTO DE PRODUTO_ANUNCIOS
-- =====================================================================

ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS status_anuncio text NOT NULL DEFAULT 'rascunho';
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS identificador_externo text;
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS url_anuncio text;
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS categoria_marketplace text;
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE public.produto_anuncios ADD COLUMN IF NOT EXISTS last_error text;

-- =====================================================================
-- 3. LIST_PRODUTO_GRUPOS — CTE recursivo com depth + path
-- =====================================================================

DROP FUNCTION IF EXISTS public.list_produto_grupos(text);

CREATE OR REPLACE FUNCTION public.list_produto_grupos(p_search text DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, parent_id uuid, parent_nome text, depth int, path text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE tree AS (
    SELECT g.id, g.nome, g.parent_id, NULL::text AS parent_nome, 0 AS depth,
           g.nome AS path, g.created_at
    FROM public.produto_grupos g
    WHERE g.empresa_id = public.current_empresa_id() AND g.parent_id IS NULL
    UNION ALL
    SELECT g.id, g.nome, g.parent_id, t.nome AS parent_nome, t.depth + 1,
           t.path || ' >> ' || g.nome, g.created_at
    FROM public.produto_grupos g
    JOIN tree t ON g.parent_id = t.id
    WHERE g.empresa_id = public.current_empresa_id()
  )
  SELECT t.id, t.nome, t.parent_id, t.parent_nome, t.depth, t.path, t.created_at
  FROM tree t
  WHERE (p_search IS NULL OR t.nome ILIKE '%' || p_search || '%')
  ORDER BY t.path;
$$;

REVOKE ALL ON FUNCTION public.list_produto_grupos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_produto_grupos(text) TO authenticated, service_role;

-- =====================================================================
-- 4. RPCS DE MARCAS (CRUD)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.list_marcas(p_search text DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.id, m.nome, m.created_at
  FROM public.marcas m
  WHERE m.empresa_id = public.current_empresa_id()
    AND (p_search IS NULL OR m.nome ILIKE '%' || p_search || '%')
  ORDER BY m.nome;
$$;

CREATE OR REPLACE FUNCTION public.upsert_marca(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid;
  v_result jsonb;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa encontrada.' USING errcode = '42501';
  END IF;

  IF p_payload->>'nome' IS NULL OR trim(p_payload->>'nome') = '' THEN
    RAISE EXCEPTION 'Nome da marca é obrigatório.';
  END IF;

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.marcas
    SET nome = trim(p_payload->>'nome'),
        updated_at = now()
    WHERE id = (p_payload->>'id')::uuid
      AND empresa_id = v_empresa_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.marcas (empresa_id, nome)
    VALUES (v_empresa_id, trim(p_payload->>'nome'))
    RETURNING id INTO v_id;
  END IF;

  SELECT to_jsonb(m.*) INTO v_result
  FROM public.marcas m
  WHERE m.id = v_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_marca(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.produtos WHERE marca_id = p_id AND empresa_id = public.current_empresa_id()) THEN
    RAISE EXCEPTION 'Não é possível excluir esta marca pois existem produtos vinculados a ela.';
  END IF;

  DELETE FROM public.marcas
  WHERE id = p_id
    AND empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.list_marcas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_marcas(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_marca(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_marca(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_marca(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_marca(uuid) TO authenticated;

-- =====================================================================
-- 5. RPCS DE ANÚNCIOS (CRUD)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.list_produto_anuncios_for_product(p_produto_id uuid)
RETURNS TABLE(
  id uuid, ecommerce_id uuid, ecommerce_nome text, ecommerce_provider text,
  identificador text, titulo text, descricao text, descricao_complementar text,
  preco_especifico numeric, status_anuncio text, identificador_externo text,
  url_anuncio text, categoria_marketplace text, sync_status text,
  last_sync_at timestamptz, last_error text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.id, a.ecommerce_id, e.nome AS ecommerce_nome, e.provider AS ecommerce_provider,
         a.identificador, a.titulo, a.descricao, a.descricao_complementar,
         a.preco_especifico, a.status_anuncio, a.identificador_externo,
         a.url_anuncio, a.categoria_marketplace, a.sync_status,
         a.last_sync_at, a.last_error
  FROM public.produto_anuncios a
  JOIN public.ecommerces e ON e.id = a.ecommerce_id AND e.empresa_id = a.empresa_id
  WHERE a.empresa_id = public.current_empresa_id()
    AND a.produto_id = p_produto_id
  ORDER BY e.nome;
$$;

CREATE OR REPLACE FUNCTION public.upsert_produto_anuncio(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid;
  v_result jsonb;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa encontrada.' USING errcode = '42501';
  END IF;

  v_id := (p_payload->>'id')::uuid;

  IF v_id IS NOT NULL THEN
    UPDATE public.produto_anuncios SET
      titulo = p_payload->>'titulo',
      descricao = p_payload->>'descricao',
      descricao_complementar = p_payload->>'descricao_complementar',
      preco_especifico = nullif(p_payload->>'preco_especifico','')::numeric,
      identificador = COALESCE(p_payload->>'identificador', identificador),
      identificador_externo = p_payload->>'identificador_externo',
      url_anuncio = p_payload->>'url_anuncio',
      categoria_marketplace = p_payload->>'categoria_marketplace',
      status_anuncio = COALESCE(nullif(p_payload->>'status_anuncio',''), status_anuncio),
      updated_at = now()
    WHERE id = v_id AND empresa_id = v_empresa_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.produto_anuncios (
      empresa_id, produto_id, ecommerce_id, identificador, titulo,
      descricao, descricao_complementar, preco_especifico,
      status_anuncio, identificador_externo, url_anuncio, categoria_marketplace
    ) VALUES (
      v_empresa_id,
      (p_payload->>'produto_id')::uuid,
      (p_payload->>'ecommerce_id')::uuid,
      COALESCE(p_payload->>'identificador', ''),
      p_payload->>'titulo',
      p_payload->>'descricao',
      p_payload->>'descricao_complementar',
      nullif(p_payload->>'preco_especifico','')::numeric,
      COALESCE(nullif(p_payload->>'status_anuncio',''), 'rascunho'),
      p_payload->>'identificador_externo',
      p_payload->>'url_anuncio',
      p_payload->>'categoria_marketplace'
    ) RETURNING id INTO v_id;
  END IF;

  SELECT to_jsonb(a.*) INTO v_result
  FROM public.produto_anuncios a
  WHERE a.id = v_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_produto_anuncio(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.produto_anuncios
  WHERE id = p_id AND empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.list_produto_anuncios_for_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_produto_anuncios_for_product(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_produto_anuncio(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_produto_anuncio(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_produto_anuncio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_produto_anuncio(uuid) TO authenticated;

-- =====================================================================
-- 6. UPDATE create_product_for_current_user — add marketplace columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_product_for_current_user(payload jsonb)
RETURNS public.produtos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  new_produto public.produtos;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa encontrada para o usuário' USING errcode = '42501';
  END IF;

  INSERT INTO public.produtos (
    empresa_id, nome, tipo, status, unidade, preco_venda, moeda,
    icms_origem, ncm, cest, tipo_embalagem, embalagem,
    peso_liquido_kg, peso_bruto_kg, num_volumes, largura_cm, altura_cm, comprimento_cm, diametro_cm,
    controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
    marca_id, tabela_medidas_id, produto_pai_id, grupo_id, descricao_complementar, video_url, slug,
    seo_titulo, seo_descricao, keywords, itens_por_caixa, preco_custo, garantia_meses, markup,
    permitir_inclusao_vendas, gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas, sku, gtin, descricao,
    cfop_padrao, cst_padrao, csosn_padrao,
    -- marketplace columns
    condicao, pais_origem, fabricante, modelo, preco_promocional
  )
  VALUES (
    v_empresa_id,
    payload->>'nome',
    nullif(payload->>'tipo','')::public.tipo_produto,
    nullif(payload->>'status','')::public.status_produto,
    payload->>'unidade',
    nullif(payload->>'preco_venda','')::numeric,
    payload->>'moeda',
    COALESCE(nullif(payload->>'icms_origem','')::integer, 0),
    payload->>'ncm',
    payload->>'cest',
    COALESCE(nullif(payload->>'tipo_embalagem','')::public.tipo_embalagem, 'outro'::public.tipo_embalagem),
    payload->>'embalagem',
    nullif(payload->>'peso_liquido_kg','')::numeric,
    nullif(payload->>'peso_bruto_kg','')::numeric,
    nullif(payload->>'num_volumes','')::integer,
    nullif(payload->>'largura_cm','')::numeric,
    nullif(payload->>'altura_cm','')::numeric,
    nullif(payload->>'comprimento_cm','')::numeric,
    nullif(payload->>'diametro_cm','')::numeric,
    nullif(payload->>'controla_estoque','')::boolean,
    nullif(payload->>'estoque_min','')::numeric,
    nullif(payload->>'estoque_max','')::numeric,
    nullif(payload->>'controlar_lotes','')::boolean,
    payload->>'localizacao',
    nullif(payload->>'dias_preparacao','')::integer,
    nullif(payload->>'marca_id','')::uuid,
    nullif(payload->>'tabela_medidas_id','')::uuid,
    nullif(payload->>'produto_pai_id','')::uuid,
    nullif(payload->>'grupo_id','')::uuid,
    payload->>'descricao_complementar',
    payload->>'video_url',
    payload->>'slug',
    payload->>'seo_titulo',
    payload->>'seo_descricao',
    payload->>'keywords',
    nullif(payload->>'itens_por_caixa','')::integer,
    nullif(payload->>'preco_custo','')::numeric,
    nullif(payload->>'garantia_meses','')::integer,
    nullif(payload->>'markup','')::numeric,
    nullif(payload->>'permitir_inclusao_vendas','')::boolean,
    payload->>'gtin_tributavel',
    payload->>'unidade_tributavel',
    nullif(payload->>'fator_conversao','')::numeric,
    payload->>'codigo_enquadramento_ipi',
    nullif(payload->>'valor_ipi_fixo','')::numeric,
    payload->>'codigo_enquadramento_legal_ipi',
    payload->>'ex_tipi',
    payload->>'observacoes_internas',
    nullif(trim(payload->>'sku'), ''),
    payload->>'gtin',
    payload->>'descricao',
    nullif(payload->>'cfop_padrao',''),
    nullif(payload->>'cst_padrao',''),
    nullif(payload->>'csosn_padrao',''),
    -- marketplace values
    COALESCE(nullif(payload->>'condicao',''), 'novo'),
    COALESCE(nullif(payload->>'pais_origem',''), 'BR'),
    nullif(trim(payload->>'fabricante'), ''),
    nullif(trim(payload->>'modelo'), ''),
    nullif(payload->>'preco_promocional','')::numeric
  )
  RETURNING * INTO new_produto;

  PERFORM pg_notify('app_log', '[RPC] [CREATE_PRODUCT] ' || new_produto.id::text);
  RETURN new_produto;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_product_for_current_user(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_product_for_current_user(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_product_for_current_user(jsonb) TO authenticated;

-- =====================================================================
-- 7. UPDATE update_product_for_current_user — add marketplace columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_product_for_current_user(p_id uuid, patch jsonb)
RETURNS public.produtos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  updated_produto public.produtos;
BEGIN
  SELECT p.empresa_id INTO v_empresa_id
  FROM public.produtos p
  WHERE p.id = p_id;

  IF v_empresa_id IS NULL OR NOT public.is_user_member_of(v_empresa_id) THEN
    RAISE EXCEPTION 'Forbidden' USING errcode = '42501';
  END IF;

  UPDATE public.produtos
  SET
    nome                 = coalesce(patch->>'nome', nome),
    tipo                 = case when patch ? 'tipo' then nullif(patch->>'tipo','')::public.tipo_produto else tipo end,
    status               = case when patch ? 'status' then nullif(patch->>'status','')::public.status_produto else status end,
    descricao            = coalesce(patch->>'descricao', descricao),
    sku                  = coalesce(patch->>'sku', sku),
    gtin                 = coalesce(patch->>'gtin', gtin),
    unidade              = coalesce(patch->>'unidade', unidade),
    preco_venda          = case when patch ? 'preco_venda' then nullif(patch->>'preco_venda','')::numeric else preco_venda end,
    icms_origem          = case when patch ? 'icms_origem' then nullif(patch->>'icms_origem','')::integer else icms_origem end,
    ncm                  = coalesce(patch->>'ncm', ncm),
    cest                 = coalesce(patch->>'cest', cest),
    tipo_embalagem       = case when patch ? 'tipo_embalagem' then nullif(patch->>'tipo_embalagem','')::public.tipo_embalagem else tipo_embalagem end,
    embalagem            = coalesce(patch->>'embalagem', embalagem),
    peso_liquido_kg      = case when patch ? 'peso_liquido_kg' then nullif(patch->>'peso_liquido_kg','')::numeric else peso_liquido_kg end,
    peso_bruto_kg        = case when patch ? 'peso_bruto_kg' then nullif(patch->>'peso_bruto_kg','')::numeric else peso_bruto_kg end,
    num_volumes          = case when patch ? 'num_volumes' then nullif(patch->>'num_volumes','')::integer else num_volumes end,
    largura_cm           = case when patch ? 'largura_cm' then nullif(patch->>'largura_cm','')::numeric else largura_cm end,
    altura_cm            = case when patch ? 'altura_cm' then nullif(patch->>'altura_cm','')::numeric else altura_cm end,
    comprimento_cm       = case when patch ? 'comprimento_cm' then nullif(patch->>'comprimento_cm','')::numeric else comprimento_cm end,
    diametro_cm          = case when patch ? 'diametro_cm' then nullif(patch->>'diametro_cm','')::numeric else diametro_cm end,
    controla_estoque     = case when patch ? 'controla_estoque' then nullif(patch->>'controla_estoque','')::boolean else controla_estoque end,
    estoque_min          = case when patch ? 'estoque_min' then nullif(patch->>'estoque_min','')::numeric else estoque_min end,
    estoque_max          = case when patch ? 'estoque_max' then nullif(patch->>'estoque_max','')::numeric else estoque_max end,
    controlar_lotes      = case when patch ? 'controlar_lotes' then nullif(patch->>'controlar_lotes','')::boolean else controlar_lotes end,
    localizacao          = coalesce(patch->>'localizacao', localizacao),
    dias_preparacao      = case when patch ? 'dias_preparacao' then nullif(patch->>'dias_preparacao','')::integer else dias_preparacao end,
    marca_id             = case when patch ? 'marca_id' then nullif(patch->>'marca_id','')::uuid else marca_id end,
    tabela_medidas_id    = case when patch ? 'tabela_medidas_id' then nullif(patch->>'tabela_medidas_id','')::uuid else tabela_medidas_id end,
    produto_pai_id       = case when patch ? 'produto_pai_id' then nullif(patch->>'produto_pai_id','')::uuid else produto_pai_id end,
    grupo_id             = case when patch ? 'grupo_id' then nullif(patch->>'grupo_id','')::uuid else grupo_id end,
    descricao_complementar = coalesce(patch->>'descricao_complementar', descricao_complementar),
    video_url            = coalesce(patch->>'video_url', video_url),
    slug                 = coalesce(patch->>'slug', slug),
    seo_titulo           = coalesce(patch->>'seo_titulo', seo_titulo),
    seo_descricao        = coalesce(patch->>'seo_descricao', seo_descricao),
    keywords             = coalesce(patch->>'keywords', keywords),
    itens_por_caixa      = case when patch ? 'itens_por_caixa' then nullif(patch->>'itens_por_caixa','')::integer else itens_por_caixa end,
    preco_custo          = case when patch ? 'preco_custo' then nullif(patch->>'preco_custo','')::numeric else preco_custo end,
    garantia_meses       = case when patch ? 'garantia_meses' then nullif(patch->>'garantia_meses','')::integer else garantia_meses end,
    markup               = case when patch ? 'markup' then nullif(patch->>'markup','')::numeric else markup end,
    permitir_inclusao_vendas = case when patch ? 'permitir_inclusao_vendas' then nullif(patch->>'permitir_inclusao_vendas','')::boolean else permitir_inclusao_vendas end,
    gtin_tributavel      = coalesce(patch->>'gtin_tributavel', gtin_tributavel),
    unidade_tributavel   = coalesce(patch->>'unidade_tributavel', unidade_tributavel),
    fator_conversao      = case when patch ? 'fator_conversao' then nullif(patch->>'fator_conversao','')::numeric else fator_conversao end,
    codigo_enquadramento_ipi     = coalesce(patch->>'codigo_enquadramento_ipi', codigo_enquadramento_ipi),
    valor_ipi_fixo       = case when patch ? 'valor_ipi_fixo' then nullif(patch->>'valor_ipi_fixo','')::numeric else valor_ipi_fixo end,
    codigo_enquadramento_legal_ipi = coalesce(patch->>'codigo_enquadramento_legal_ipi', codigo_enquadramento_legal_ipi),
    ex_tipi              = coalesce(patch->>'ex_tipi', ex_tipi),
    observacoes_internas = coalesce(patch->>'observacoes_internas', observacoes_internas),
    -- marketplace columns
    condicao             = case when patch ? 'condicao' then COALESCE(nullif(patch->>'condicao',''), 'novo') else condicao end,
    pais_origem          = case when patch ? 'pais_origem' then nullif(patch->>'pais_origem','') else pais_origem end,
    fabricante           = case when patch ? 'fabricante' then nullif(trim(patch->>'fabricante'),'') else fabricante end,
    modelo               = case when patch ? 'modelo' then nullif(trim(patch->>'modelo'),'') else modelo end,
    preco_promocional    = case when patch ? 'preco_promocional' then nullif(patch->>'preco_promocional','')::numeric else preco_promocional end
  WHERE id = p_id
  RETURNING * INTO updated_produto;

  IF updated_produto.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado' USING errcode = '02000';
  END IF;

  PERFORM pg_notify('app_log', '[RPC] [UPDATE_PRODUCT] ' || updated_produto.id::text);
  RETURN updated_produto;
END;
$function$;

-- =====================================================================
-- 8. UPDATE create_product_clone_for_current_user — add marketplace columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_product_clone_for_current_user(p_source_product_id uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
RETURNS public.produtos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_src public.produtos;
  v_payload jsonb;
  v_base_sku text;
  v_candidate_sku text;
  v_i int := 1;
  v_new public.produtos;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][CLONE_PRODUCT] empresa_id inválido para a sessão' USING errcode='42501';
  END IF;

  SELECT * INTO v_src
  FROM public.produtos p
  WHERE p.id = p_source_product_id
    AND p.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][CLONE_PRODUCT] produto não encontrado na empresa atual' USING errcode='P0002';
  END IF;

  v_payload := to_jsonb(v_src)
    - 'id' - 'empresa_id' - 'created_at' - 'updated_at' - 'principal_image_id';

  v_payload := v_payload
    || jsonb_build_object('nome', coalesce(p_overrides->>'nome', 'Cópia de ' || coalesce(v_src.nome, 'Produto')))
    || jsonb_build_object('status', 'inativo');

  v_base_sku := nullif(coalesce(p_overrides->>'sku', nullif(v_src.sku, '') || '-copy'), '');
  IF v_base_sku IS NOT NULL THEN
    v_candidate_sku := v_base_sku;
    WHILE EXISTS (SELECT 1 FROM public.produtos WHERE empresa_id = v_empresa_id AND sku = v_candidate_sku) LOOP
      v_i := v_i + 1;
      v_candidate_sku := v_base_sku || '-' || v_i::text;
    END LOOP;
    v_payload := v_payload || jsonb_build_object('sku', v_candidate_sku);
  ELSE
    v_payload := v_payload || jsonb_build_object('sku', null);
  END IF;

  v_payload := v_payload || jsonb_build_object('principal_image_id', null);
  v_payload := v_payload || jsonb_build_object('gtin', null);

  INSERT INTO public.produtos (
    empresa_id, nome, tipo, status, unidade, preco_venda, moeda,
    icms_origem, ncm, cest, tipo_embalagem, embalagem,
    peso_liquido_kg, peso_bruto_kg, num_volumes, largura_cm, altura_cm, comprimento_cm, diametro_cm,
    controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
    marca_id, tabela_medidas_id, produto_pai_id, descricao_complementar, video_url, slug,
    seo_titulo, seo_descricao, keywords, itens_por_caixa, preco_custo, garantia_meses, markup,
    permitir_inclusao_vendas, gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas, sku, gtin, descricao,
    cfop_padrao, cst_padrao, csosn_padrao,
    grupo_id,
    -- marketplace columns
    condicao, pais_origem, fabricante, modelo, preco_promocional
  ) VALUES (
    v_empresa_id,
    (v_payload->>'nome'),
    (v_payload->>'tipo')::public.tipo_produto,
    (v_payload->>'status')::public.status_produto,
    (v_payload->>'unidade'),
    (v_payload->>'preco_venda')::numeric,
    (v_payload->>'moeda'),
    (v_payload->>'icms_origem')::int,
    (v_payload->>'ncm'),
    (v_payload->>'cest'),
    (v_payload->>'tipo_embalagem')::public.tipo_embalagem,
    (v_payload->>'embalagem'),
    (v_payload->>'peso_liquido_kg')::numeric,
    (v_payload->>'peso_bruto_kg')::numeric,
    (v_payload->>'num_volumes')::int,
    (v_payload->>'largura_cm')::numeric,
    (v_payload->>'altura_cm')::numeric,
    (v_payload->>'comprimento_cm')::numeric,
    (v_payload->>'diametro_cm')::numeric,
    (v_payload->>'controla_estoque')::boolean,
    (v_payload->>'estoque_min')::numeric,
    (v_payload->>'estoque_max')::numeric,
    (v_payload->>'controlar_lotes')::boolean,
    (v_payload->>'localizacao'),
    (v_payload->>'dias_preparacao')::int,
    (v_payload->>'marca_id')::uuid,
    (v_payload->>'tabela_medidas_id')::uuid,
    (v_payload->>'produto_pai_id')::uuid,
    (v_payload->>'descricao_complementar'),
    (v_payload->>'video_url'),
    (v_payload->>'slug'),
    (v_payload->>'seo_titulo'),
    (v_payload->>'seo_descricao'),
    (v_payload->>'keywords'),
    (v_payload->>'itens_por_caixa')::numeric,
    (v_payload->>'preco_custo')::numeric,
    (v_payload->>'garantia_meses')::int,
    (v_payload->>'markup')::numeric,
    (v_payload->>'permitir_inclusao_vendas')::boolean,
    (v_payload->>'gtin_tributavel'),
    (v_payload->>'unidade_tributavel'),
    (v_payload->>'fator_conversao')::numeric,
    (v_payload->>'codigo_enquadramento_ipi'),
    (v_payload->>'valor_ipi_fixo')::numeric,
    (v_payload->>'codigo_enquadramento_legal_ipi'),
    (v_payload->>'ex_tipi'),
    (v_payload->>'observacoes_internas'),
    (v_payload->>'sku'),
    (v_payload->>'gtin'),
    (v_payload->>'descricao'),
    nullif(v_payload->>'cfop_padrao',''),
    nullif(v_payload->>'cst_padrao',''),
    nullif(v_payload->>'csosn_padrao',''),
    (v_payload->>'grupo_id')::uuid,
    -- marketplace values
    COALESCE(v_payload->>'condicao', 'novo'),
    v_payload->>'pais_origem',
    v_payload->>'fabricante',
    v_payload->>'modelo',
    (v_payload->>'preco_promocional')::numeric
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_product_clone_for_current_user(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_clone_for_current_user(uuid, jsonb) TO authenticated;

-- =====================================================================
-- 9. UPDATE produtos_variantes_generate — add marketplace columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.produtos_variantes_generate_for_current_user(
  p_produto_pai_id uuid,
  p_atributo_id uuid,
  p_valores_text text[],
  p_sku_suffix_mode text DEFAULT 'slug'
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

  IF COALESCE(NULLIF(btrim(v_parent.sku), ''), '') = '' THEN
    v_base_sku := 'VAR' || lpad(v_parent.id::text, 8, '0');
  ELSE
    v_base_sku := btrim(v_parent.sku);
  END IF;

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
        -- marketplace: inherit from parent
        condicao = v_parent.condicao,
        pais_origem = v_parent.pais_origem,
        fabricante = v_parent.fabricante,
        modelo = v_parent.modelo,
        preco_promocional = v_parent.preco_promocional,
        updated_at = now()
      WHERE id = v_variant_id
        AND empresa_id = v_empresa;
    ELSE
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
        empresa_id, tipo, status, nome, sku, unidade, preco_venda, moeda,
        icms_origem, ncm, cest, cfop_padrao, cst_padrao, csosn_padrao,
        tipo_embalagem, embalagem,
        peso_liquido_kg, peso_bruto_kg, num_volumes, largura_cm, altura_cm, comprimento_cm, diametro_cm,
        controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
        marca_id, tabela_medidas_id, produto_pai_id, grupo_id,
        descricao, descricao_complementar, video_url, slug, seo_titulo, seo_descricao, keywords,
        permitir_inclusao_vendas, gtin, gtin_tributavel, unidade_tributavel, fator_conversao,
        codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
        observacoes_internas,
        -- marketplace columns
        condicao, pais_origem, fabricante, modelo, preco_promocional
      ) VALUES (
        v_empresa,
        v_parent.tipo, v_parent.status, v_nome, v_candidate_sku,
        v_parent.unidade, v_parent.preco_venda, v_parent.moeda,
        COALESCE(v_parent.icms_origem, 0),
        v_parent.ncm, v_parent.cest, v_parent.cfop_padrao, v_parent.cst_padrao, v_parent.csosn_padrao,
        v_parent.tipo_embalagem, v_parent.embalagem,
        v_parent.peso_liquido_kg, v_parent.peso_bruto_kg, v_parent.num_volumes,
        v_parent.largura_cm, v_parent.altura_cm, v_parent.comprimento_cm, v_parent.diametro_cm,
        v_parent.controla_estoque, v_parent.estoque_min, v_parent.estoque_max,
        v_parent.controlar_lotes, v_parent.localizacao, v_parent.dias_preparacao,
        v_parent.marca_id, v_parent.tabela_medidas_id,
        v_parent.id, v_parent.grupo_id,
        v_parent.descricao, v_parent.descricao_complementar, v_parent.video_url,
        v_parent.slug, v_parent.seo_titulo, v_parent.seo_descricao, v_parent.keywords,
        v_parent.permitir_inclusao_vendas,
        NULLIF(btrim(v_parent.gtin), ''), NULLIF(btrim(v_parent.gtin_tributavel), ''),
        v_parent.unidade_tributavel, v_parent.fator_conversao,
        v_parent.codigo_enquadramento_ipi, v_parent.valor_ipi_fixo,
        v_parent.codigo_enquadramento_legal_ipi, v_parent.ex_tipi,
        v_parent.observacoes_internas,
        -- marketplace values inherited from parent
        v_parent.condicao, v_parent.pais_origem, v_parent.fabricante, v_parent.modelo, v_parent.preco_promocional
      )
      RETURNING id INTO v_variant_id;
    END IF;

    INSERT INTO public.produto_atributos (empresa_id, produto_id, atributo_id, valor_text)
    VALUES (v_empresa, v_variant_id, p_atributo_id, v_val)
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

-- =====================================================================
-- 10. SCHEMA RELOAD
-- =====================================================================

SELECT pg_notify('pgrst', 'reload schema');
