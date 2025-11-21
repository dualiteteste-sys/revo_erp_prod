-- Crie… RPCs seguras de criação/atualização de produtos com casts seguros
-- Padrões: SECURITY DEFINER, search_path seguro, RLS por operação ativa nas tabelas
-- Logs leves via pg_notify

-- 1) CREATE (injeta empresa_id do usuário atual)
create or replace function public.create_product_for_current_user(payload jsonb)
returns public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  new_produto public.produtos;
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa encontrada para o usuário' using errcode = '42501';
  end if;

  insert into public.produtos (
    empresa_id, nome, tipo, status, unidade, preco_venda, moeda,
    icms_origem, ncm, cest, tipo_embalagem, embalagem,
    peso_liquido_kg, peso_bruto_kg, num_volumes, largura_cm, altura_cm, comprimento_cm, diametro_cm,
    controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
    marca_id, tabela_medidas_id, produto_pai_id, descricao_complementar, video_url, slug,
    seo_titulo, seo_descricao, keywords, itens_por_caixa, preco_custo, garantia_meses, markup,
    permitir_inclusao_vendas, gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas, sku, gtin, descricao
  )
  values (
    v_empresa_id,
    payload->>'nome',
    nullif(payload->>'tipo','')::public.tipo_produto,
    nullif(payload->>'status','')::public.status_produto,
    payload->>'unidade',
    nullif(payload->>'preco_venda','')::numeric,
    payload->>'moeda',
    nullif(payload->>'icms_origem','')::integer,
    payload->>'ncm',
    payload->>'cest',
    nullif(payload->>'tipo_embalagem','')::public.tipo_embalagem,
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
    payload->>'sku',
    payload->>'gtin',
    payload->>'descricao'
  )
  returning * into new_produto;

  perform pg_notify('app_log', '[RPC] [CREATE_PRODUCT] ' || new_produto.id::text);
  return new_produto;
end;
$$;

-- 2) UPDATE (só permite se usuário for membro da empresa do produto)
create or replace function public.update_product_for_current_user(p_id uuid, patch jsonb)
returns public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
  updated_produto public.produtos;
begin
  select p.empresa_id into v_empresa_id
  from public.produtos p
  where p.id = p_id;

  if v_empresa_id is null or not public.is_user_member_of(v_empresa_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.produtos
  set
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
    observacoes_internas = coalesce(patch->>'observacoes_internas', observacoes_internas)
  where id = p_id
  returning * into updated_produto;

  if updated_produto.id is null then
    raise exception 'Produto não encontrado' using errcode = '02000';
  end if;

  perform pg_notify('app_log', '[RPC] [UPDATE_PRODUCT] ' || updated_produto.id::text);
  return updated_produto;
end;
$$;

-- 3) ACLs mínimas
revoke all on function public.create_product_for_current_user(jsonb) from public, anon;
revoke all on function public.update_product_for_current_user(uuid, jsonb) from public, anon;

grant execute on function public.create_product_for_current_user(jsonb)       to authenticated, service_role, postgres;
grant execute on function public.update_product_for_current_user(uuid, jsonb) to authenticated, service_role, postgres;
