-- Habilita RPCs seguras para criar e atualizar produtos,
-- garantindo que a `empresa_id` seja injetada pelo backend
-- com base no usuário autenticado.

-- 1) RPC para CRIAR produto
create or replace function public.create_product_for_current_user(payload jsonb)
returns "produtos"
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  new_produto "produtos";
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa encontrada para o usuário' using errcode = '42501';
  end if;

  insert into public.produtos (empresa_id, nome, tipo, status, unidade, preco_venda, moeda, icms_origem, ncm, cest, tipo_embalagem, embalagem, peso_liquido_kg, peso_bruto_kg, num_volumes, largura_cm, altura_cm, comprimento_cm, diametro_cm, controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao, marca_id, tabela_medidas_id, produto_pai_id, descricao_complementar, video_url, slug, seo_titulo, seo_descricao, keywords, itens_por_caixa, preco_custo, garantia_meses, markup, permitir_inclusao_vendas, gtin_tributavel, unidade_tributavel, fator_conversao, codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi, observacoes_internas, sku, gtin, descricao)
  values (
    v_empresa_id,
    payload->>'nome',
    (payload->>'tipo')::tipo_produto,
    (payload->>'status')::status_produto,
    payload->>'unidade',
    (payload->>'preco_venda')::numeric,
    payload->>'moeda',
    (payload->>'icms_origem')::integer,
    payload->>'ncm',
    payload->>'cest',
    (payload->>'tipo_embalagem')::tipo_embalagem,
    payload->>'embalagem',
    (payload->>'peso_liquido_kg')::numeric,
    (payload->>'peso_bruto_kg')::numeric,
    (payload->>'num_volumes')::integer,
    (payload->>'largura_cm')::numeric,
    (payload->>'altura_cm')::numeric,
    (payload->>'comprimento_cm')::numeric,
    (payload->>'diametro_cm')::numeric,
    (payload->>'controla_estoque')::boolean,
    (payload->>'estoque_min')::numeric,
    (payload->>'estoque_max')::numeric,
    (payload->>'controlar_lotes')::boolean,
    payload->>'localizacao',
    (payload->>'dias_preparacao')::integer,
    (payload->>'marca_id')::uuid,
    (payload->>'tabela_medidas_id')::uuid,
    (payload->>'produto_pai_id')::uuid,
    payload->>'descricao_complementar',
    payload->>'video_url',
    payload->>'slug',
    payload->>'seo_titulo',
    payload->>'seo_descricao',
    payload->>'keywords',
    (payload->>'itens_por_caixa')::integer,
    (payload->>'preco_custo')::numeric,
    (payload->>'garantia_meses')::integer,
    (payload->>'markup')::numeric,
    (payload->>'permitir_inclusao_vendas')::boolean,
    payload->>'gtin_tributavel',
    payload->>'unidade_tributavel',
    (payload->>'fator_conversao')::numeric,
    payload->>'codigo_enquadramento_ipi',
    (payload->>'valor_ipi_fixo')::numeric,
    payload->>'codigo_enquadramento_legal_ipi',
    payload->>'ex_tipi',
    payload->>'observacoes_internas',
    payload->>'sku',
    payload->>'gtin',
    payload->>'descricao'
  ) returning * into new_produto;

  return new_produto;
end;
$$;

-- 2) RPC para ATUALIZAR produto
create or replace function public.update_product_for_current_user(p_id uuid, patch jsonb)
returns "produtos"
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
  updated_produto "produtos";
begin
  -- Verifica se o produto pertence a uma empresa da qual o usuário é membro
  select p.empresa_id into v_empresa_id
  from public.produtos p
  where p.id = p_id;

  if v_empresa_id is null or not public.is_user_member_of(v_empresa_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.produtos
  set
    nome = coalesce(patch->>'nome', nome),
    tipo = coalesce((patch->>'tipo')::tipo_produto, tipo),
    status = coalesce((patch->>'status')::status_produto, status),
    descricao = coalesce(patch->>'descricao', descricao),
    sku = coalesce(patch->>'sku', sku),
    gtin = coalesce(patch->>'gtin', gtin),
    unidade = coalesce(patch->>'unidade', unidade),
    preco_venda = coalesce((patch->>'preco_venda')::numeric, preco_venda),
    icms_origem = coalesce((patch->>'icms_origem')::integer, icms_origem),
    ncm = coalesce(patch->>'ncm', ncm),
    cest = coalesce(patch->>'cest', cest),
    tipo_embalagem = coalesce((patch->>'tipo_embalagem')::tipo_embalagem, tipo_embalagem),
    embalagem = coalesce(patch->>'embalagem', embalagem),
    peso_liquido_kg = coalesce((patch->>'peso_liquido_kg')::numeric, peso_liquido_kg),
    peso_bruto_kg = coalesce((patch->>'peso_bruto_kg')::numeric, peso_bruto_kg),
    num_volumes = coalesce((patch->>'num_volumes')::integer, num_volumes),
    largura_cm = coalesce((patch->>'largura_cm')::numeric, largura_cm),
    altura_cm = coalesce((patch->>'altura_cm')::numeric, altura_cm),
    comprimento_cm = coalesce((patch->>'comprimento_cm')::numeric, comprimento_cm),
    diametro_cm = coalesce((patch->>'diametro_cm')::numeric, diametro_cm),
    controla_estoque = coalesce((patch->>'controla_estoque')::boolean, controla_estoque),
    estoque_min = coalesce((patch->>'estoque_min')::numeric, estoque_min),
    estoque_max = coalesce((patch->>'estoque_max')::numeric, estoque_max),
    controlar_lotes = coalesce((patch->>'controlar_lotes')::boolean, controlar_lotes),
    localizacao = coalesce(patch->>'localizacao', localizacao),
    dias_preparacao = coalesce((patch->>'dias_preparacao')::integer, dias_preparacao),
    marca_id = coalesce((patch->>'marca_id')::uuid, marca_id),
    tabela_medidas_id = coalesce((patch->>'tabela_medidas_id')::uuid, tabela_medidas_id),
    produto_pai_id = coalesce((patch->>'produto_pai_id')::uuid, produto_pai_id),
    descricao_complementar = coalesce(patch->>'descricao_complementar', descricao_complementar),
    video_url = coalesce(patch->>'video_url', video_url),
    slug = coalesce(patch->>'slug', slug),
    seo_titulo = coalesce(patch->>'seo_titulo', seo_titulo),
    seo_descricao = coalesce(patch->>'seo_descricao', seo_descricao),
    keywords = coalesce(patch->>'keywords', keywords),
    itens_por_caixa = coalesce((patch->>'itens_por_caixa')::integer, itens_por_caixa),
    preco_custo = coalesce((patch->>'preco_custo')::numeric, preco_custo),
    garantia_meses = coalesce((patch->>'garantia_meses')::integer, garantia_meses),
    markup = coalesce((patch->>'markup')::numeric, markup),
    permitir_inclusao_vendas = coalesce((patch->>'permitir_inclusao_vendas')::boolean, permitir_inclusao_vendas),
    gtin_tributavel = coalesce(patch->>'gtin_tributavel', gtin_tributavel),
    unidade_tributavel = coalesce(patch->>'unidade_tributavel', unidade_tributavel),
    fator_conversao = coalesce((patch->>'fator_conversao')::numeric, fator_conversao),
    codigo_enquadramento_ipi = coalesce(patch->>'codigo_enquadramento_ipi', codigo_enquadramento_ipi),
    valor_ipi_fixo = coalesce((patch->>'valor_ipi_fixo')::numeric, valor_ipi_fixo),
    codigo_enquadramento_legal_ipi = coalesce(patch->>'codigo_enquadramento_legal_ipi', codigo_enquadramento_legal_ipi),
    ex_tipi = coalesce(patch->>'ex_tipi', ex_tipi),
    observacoes_internas = coalesce(patch->>'observacoes_internas', observacoes_internas)
  where id = p_id
  returning * into updated_produto;

  return updated_produto;
end;
$$;

-- 3) Permissões
grant execute on function public.create_product_for_current_user(jsonb) to authenticated;
grant execute on function public.update_product_for_current_user(uuid, jsonb) to authenticated;
