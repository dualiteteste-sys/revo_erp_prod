-- 1. Corrige a função de criação de produto para receber o ID da empresa explicitamente.
create or replace function public.create_product_for_current_user(p_empresa_id uuid, payload jsonb)
returns public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_prod public.produtos;
  v_is_member boolean;
begin
  -- Security Check: Garante que o usuário atual é membro da empresa alvo.
  select exists (
    select 1 from public.empresa_usuarios
    where empresa_id = p_empresa_id and user_id = v_user_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Forbidden: User is not a member of the target company' using errcode = '42501';
  end if;

  perform public.validate_fiscais(payload->>'ncm', payload->>'cest');

  insert into public.produtos (
    empresa_id, tipo, status, nome, descricao, sku, gtin, unidade, preco_venda, moeda,
    icms_origem, ncm, cest,
    tipo_embalagem, embalagem, peso_liquido_kg, peso_bruto_kg, num_volumes,
    largura_cm, altura_cm, comprimento_cm, diametro_cm,
    controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
    marca_id, tabela_medidas_id, produto_pai_id,
    descricao_complementar, video_url, slug, seo_titulo, seo_descricao, keywords,
    itens_por_caixa, preco_custo, linha_produto_id, garantia_meses, markup, permitir_inclusao_vendas,
    gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas
  )
  values (
    p_empresa_id, -- Usa o ID da empresa passado como parâmetro
    coalesce((payload->>'tipo')::public.tipo_produto, 'simples'),
    coalesce((payload->>'status')::public.status_produto, 'ativo'),
    payload->>'nome',
    payload->>'descricao',
    nullif(payload->>'sku',''),
    nullif(payload->>'gtin',''),
    coalesce(payload->>'unidade','un'),
    coalesce((payload->>'preco_venda')::numeric,0),
    coalesce(payload->>'moeda','BRL'),
    coalesce((payload->>'icms_origem')::int2,0),
    nullif(payload->>'ncm',''),
    nullif(payload->>'cest',''),
    coalesce((payload->>'tipo_embalagem')::public.tipo_embalagem,'pacote_caixa'),
    nullif(payload->>'embalagem',''),
    coalesce((payload->>'peso_liquido_kg')::numeric,0),
    coalesce((payload->>'peso_bruto_kg')::numeric,0),
    coalesce((payload->>'num_volumes')::int,0),
    coalesce((payload->>'largura_cm')::numeric,0),
    coalesce((payload->>'altura_cm')::numeric,0),
    coalesce((payload->>'comprimento_cm')::numeric,0),
    coalesce((payload->>'diametro_cm')::numeric,0),
    coalesce((payload->>'controla_estoque')::boolean,true),
    coalesce((payload->>'estoque_min')::numeric,0),
    coalesce((payload->>'estoque_max')::numeric,0),
    coalesce((payload->>'controlar_lotes')::boolean,false),
    nullif(payload->>'localizacao',''),
    coalesce((payload->>'dias_preparacao')::int,0),
    (payload->>'marca_id')::uuid,
    (payload->>'tabela_medidas_id')::uuid,
    (payload->>'produto_pai_id')::uuid,
    payload->>'descricao_complementar',
    nullif(payload->>'video_url',''),
    nullif(payload->>'slug',''),
    nullif(payload->>'seo_titulo',''),
    nullif(payload->>'seo_descricao',''),
    nullif(payload->>'keywords',''),
    coalesce((payload->>'itens_por_caixa')::int,0),
    (payload->>'preco_custo')::numeric,
    (payload->>'linha_produto_id')::uuid,
    (payload->>'garantia_meses')::int,
    coalesce((payload->>'markup')::numeric,0),
    coalesce((payload->>'permitir_inclusao_vendas')::boolean,true),
    nullif(payload->>'gtin_tributavel',''),
    nullif(payload->>'unidade_tributavel',''),
    (payload->>'fator_conversao')::numeric,
    nullif(payload->>'codigo_enquadramento_ipi',''),
    (payload->>'valor_ipi_fixo')::numeric,
    nullif(payload->>'codigo_enquadramento_legal_ipi',''),
    nullif(payload->>'ex_tipi',''),
    payload->>'observacoes_internas'
  )
  returning * into v_prod;

  return v_prod;
end;
$$;

-- 2. Corrige a função de atualização de produto para receber o ID da empresa explicitamente.
create or replace function public.update_product_for_current_user(p_id uuid, p_empresa_id uuid, patch jsonb)
returns public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_prod public.produtos;
  v_is_member boolean;
begin
  -- Security Check: Garante que o usuário atual é membro da empresa alvo.
  select exists (
    select 1 from public.empresa_usuarios
    where empresa_id = p_empresa_id and user_id = v_user_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Forbidden: User is not a member of the target company' using errcode = '42501';
  end if;

  if patch ? 'ncm' or patch ? 'cest' then
    perform public.validate_fiscais(patch->>'ncm', patch->>'cest');
  end if;

  update public.produtos p
     set
       tipo = coalesce((patch->>'tipo')::public.tipo_produto, p.tipo),
       status = coalesce((patch->>'status')::public.status_produto, p.status),
       nome = coalesce(patch->>'nome', p.nome),
       descricao = coalesce(patch->>'descricao', p.descricao),
       sku = coalesce(nullif(patch->>'sku',''), p.sku),
       gtin = coalesce(nullif(patch->>'gtin',''), p.gtin),
       unidade = coalesce(patch->>'unidade', p.unidade),
       preco_venda = coalesce((patch->>'preco_venda')::numeric, p.preco_venda),
       moeda = coalesce(patch->>'moeda', p.moeda),
       icms_origem = coalesce((patch->>'icms_origem')::int2, p.icms_origem),
       ncm = coalesce(nullif(patch->>'ncm',''), p.ncm),
       cest = coalesce(nullif(patch->>'cest',''), p.cest),
       tipo_embalagem = coalesce((patch->>'tipo_embalagem')::public.tipo_embalagem, p.tipo_embalagem),
       embalagem = coalesce(nullif(patch->>'embalagem',''), p.embalagem),
       peso_liquido_kg = coalesce((patch->>'peso_liquido_kg')::numeric, p.peso_liquido_kg),
       peso_bruto_kg  = coalesce((patch->>'peso_bruto_kg')::numeric, p.peso_bruto_kg),
       num_volumes = coalesce((patch->>'num_volumes')::int, p.num_volumes),
       largura_cm = coalesce((patch->>'largura_cm')::numeric, p.largura_cm),
       altura_cm = coalesce((patch->>'altura_cm')::numeric, p.altura_cm),
       comprimento_cm = coalesce((patch->>'comprimento_cm')::numeric, p.comprimento_cm),
       diametro_cm = coalesce((patch->>'diametro_cm')::numeric, p.diametro_cm),
       controla_estoque = coalesce((patch->>'controla_estoque')::boolean, p.controla_estoque),
       estoque_min = coalesce((patch->>'estoque_min')::numeric, p.estoque_min),
       estoque_max = coalesce((patch->>'estoque_max')::numeric, p.estoque_max),
       controlar_lotes = coalesce((patch->>'controlar_lotes')::boolean, p.controlar_lotes),
       localizacao = coalesce(nullif(patch->>'localizacao',''), p.localizacao),
       dias_preparacao = coalesce((patch->>'dias_preparacao')::int, p.dias_preparacao),
       marca_id = coalesce((patch->>'marca_id')::uuid, p.marca_id),
       tabela_medidas_id = coalesce((patch->>'tabela_medidas_id')::uuid, p.tabela_medidas_id),
       produto_pai_id = coalesce((patch->>'produto_pai_id')::uuid, p.produto_pai_id),
       descricao_complementar = coalesce(patch->>'descricao_complementar', p.descricao_complementar),
       video_url = coalesce(nullif(patch->>'video_url',''), p.video_url),
       slug = coalesce(nullif(patch->>'slug',''), p.slug),
       seo_titulo = coalesce(nullif(patch->>'seo_titulo',''), p.seo_titulo),
       seo_descricao = coalesce(nullif(patch->>'seo_descricao',''), p.seo_descricao),
       keywords = coalesce(nullif(patch->>'keywords',''), p.keywords),
       itens_por_caixa = coalesce((patch->>'itens_por_caixa')::int, p.itens_por_caixa),
       preco_custo = coalesce((patch->>'preco_custo')::numeric, p.preco_custo),
       linha_produto_id = coalesce((patch->>'linha_produto_id')::uuid, p.linha_produto_id),
       garantia_meses = coalesce((patch->>'garantia_meses')::int, p.garantia_meses),
       markup = coalesce((patch->>'markup')::numeric, p.markup),
       permitir_inclusao_vendas = coalesce((patch->>'permitir_inclusao_vendas')::boolean, p.permitir_inclusao_vendas),
       gtin_tributavel = coalesce(nullif(patch->>'gtin_tributavel',''), p.gtin_tributavel),
       unidade_tributavel = coalesce(nullif(patch->>'unidade_tributavel',''), p.unidade_tributavel),
       fator_conversao = coalesce((patch->>'fator_conversao')::numeric, p.fator_conversao),
       codigo_enquadramento_ipi = coalesce(nullif(patch->>'codigo_enquadramento_ipi',''), p.codigo_enquadramento_ipi),
       valor_ipi_fixo = coalesce((patch->>'valor_ipi_fixo')::numeric, p.valor_ipi_fixo),
       codigo_enquadramento_legal_ipi = coalesce(nullif(patch->>'codigo_enquadramento_legal_ipi',''), p.codigo_enquadramento_legal_ipi),
       ex_tipi = coalesce(nullif(patch->>'ex_tipi',''), p.ex_tipi),
       observacoes_internas = coalesce(patch->>'observacoes_internas', p.observacoes_internas)
   where p.id = p_id
     and p.empresa_id = p_empresa_id -- Garante que o update só afete o produto na empresa correta.
  returning * into v_prod;

  if not found then
    raise no_data_found using message = '[RPC][UPDATE_PRODUCT] produto não encontrado na empresa atual';
  end if;

  return v_prod;
end;
$$;
