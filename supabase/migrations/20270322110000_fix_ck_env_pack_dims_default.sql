-- Fix: ck_env_pack_dims constraint violation no create_product e CSV import
-- Bug P1: 44 ocorrências em prod (2026-03-20)
-- Root cause: COALESCE defaultava tipo_embalagem para 'pacote_caixa' quando null,
--   mas 'pacote_caixa' exige largura_cm, altura_cm, comprimento_cm pela constraint
--   ck_env_pack_dims. CSV import não envia dimensões → constraint viola.
-- Fix: (1) default 'outro' no COALESCE (ELSE true na constraint),
--       (2) default da coluna 'outro' em vez de 'pacote_caixa'.

-- 1) Alterar DEFAULT da coluna para 'outro' (sem exigência de dimensões)
ALTER TABLE public.produtos
  ALTER COLUMN tipo_embalagem SET DEFAULT 'outro'::public.tipo_embalagem;

-- 2) Reescrever create_product_for_current_user com default 'outro'
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
    cfop_padrao, cst_padrao, csosn_padrao
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
    nullif(payload->>'csosn_padrao','')
  )
  RETURNING * INTO new_produto;

  PERFORM pg_notify('app_log', '[RPC] [CREATE_PRODUCT] ' || new_produto.id::text);
  RETURN new_produto;
END;
$function$;

-- Grants (manter padrão existente)
REVOKE ALL ON FUNCTION public.create_product_for_current_user(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_product_for_current_user(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_product_for_current_user(jsonb) TO authenticated;
