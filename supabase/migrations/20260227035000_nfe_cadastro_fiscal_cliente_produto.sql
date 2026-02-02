/*
  NFE-03: Cadastro fiscal de cliente/produto (base)

  Objetivo:
  - Produto: armazenar defaults de CFOP/CST/CSOSN para pré-preenchimento de itens.
  - Cliente (destinatário): permitir armazenar código IBGE do município e código do país no endereço.
  - Emissão: armazenar "natureza da operação" no cabeçalho do rascunho.

  Observações:
  - Regras fiscais por UF/regime e motor de cálculo ficam para NFE-04.
  - Constraints são NOT VALID para não quebrar bancos já existentes; novos/updates já validam.
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Produtos: defaults fiscais para NF-e
-- ---------------------------------------------------------------------------
alter table public.produtos
  add column if not exists cfop_padrao text,
  add column if not exists cst_padrao text,
  add column if not exists csosn_padrao text;

alter table public.produtos
  drop constraint if exists produtos_cfop_padrao_check,
  add constraint produtos_cfop_padrao_check
    check (cfop_padrao is null or cfop_padrao ~ '^[0-9]{4}$') not valid;

alter table public.produtos
  drop constraint if exists produtos_cst_padrao_check,
  add constraint produtos_cst_padrao_check
    check (cst_padrao is null or cst_padrao ~ '^[0-9]{2}$') not valid;

alter table public.produtos
  drop constraint if exists produtos_csosn_padrao_check,
  add constraint produtos_csosn_padrao_check
    check (csosn_padrao is null or csosn_padrao ~ '^[0-9]{3}$') not valid;

-- ---------------------------------------------------------------------------
-- 2) Destinatário: endereço com código IBGE do município e país (opcional)
-- ---------------------------------------------------------------------------
alter table public.pessoa_enderecos
  add column if not exists cidade_codigo text,
  add column if not exists pais_codigo text default '1058';

alter table public.pessoa_enderecos
  drop constraint if exists pessoa_enderecos_cidade_codigo_check,
  add constraint pessoa_enderecos_cidade_codigo_check
    check (cidade_codigo is null or cidade_codigo ~ '^[0-9]{7}$') not valid;

alter table public.pessoa_enderecos
  drop constraint if exists pessoa_enderecos_pais_codigo_check,
  add constraint pessoa_enderecos_pais_codigo_check
    check (pais_codigo is null or pais_codigo ~ '^[0-9]{4}$') not valid;

-- Atualiza RPC de parceiro para suportar os novos campos no endereço
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_id uuid;
  v_pessoa jsonb := coalesce(p_payload->'pessoa','{}'::jsonb);
  v_enderecos jsonb := p_payload->'enderecos';
  v_contatos jsonb := p_payload->'contatos';
  v_endereco jsonb;
  v_contato jsonb;
  v_endereco_ids uuid[] := '{}';
  v_contato_ids uuid[] := '{}';
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  v_pessoa_id := nullif(v_pessoa->>'id','')::uuid;

  if v_pessoa_id is null then
    insert into public.pessoas (
      empresa_id, tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone, celular, site,
      inscr_estadual, isento_ie, inscr_municipal, observacoes, codigo_externo, contribuinte_icms, contato_tags,
      limite_credito, condicao_pagamento, informacoes_bancarias, deleted_at
    ) values (
      v_empresa_id,
      coalesce(nullif(v_pessoa->>'tipo','')::public.pessoa_tipo, 'cliente'::public.pessoa_tipo),
      coalesce(nullif(v_pessoa->>'tipo_pessoa','')::public.tipo_pessoa_enum, 'juridica'::public.tipo_pessoa_enum),
      nullif(v_pessoa->>'nome',''),
      nullif(v_pessoa->>'fantasia',''),
      nullif(v_pessoa->>'doc_unico',''),
      nullif(v_pessoa->>'email',''),
      nullif(v_pessoa->>'telefone',''),
      nullif(v_pessoa->>'celular',''),
      nullif(v_pessoa->>'site',''),
      nullif(v_pessoa->>'inscr_estadual',''),
      coalesce(nullif(v_pessoa->>'isento_ie','')::boolean, false),
      nullif(v_pessoa->>'inscr_municipal',''),
      nullif(v_pessoa->>'observacoes',''),
      nullif(v_pessoa->>'codigo_externo',''),
      coalesce(nullif(v_pessoa->>'contribuinte_icms','')::public.contribuinte_icms_enum, '9'::public.contribuinte_icms_enum),
      case when jsonb_typeof(v_pessoa->'contato_tags') = 'array'
        then array(select jsonb_array_elements_text(v_pessoa->'contato_tags'))
        else null
      end,
      nullif(v_pessoa->>'limite_credito','')::numeric,
      nullif(v_pessoa->>'condicao_pagamento',''),
      nullif(v_pessoa->>'informacoes_bancarias',''),
      null
    ) returning id into v_pessoa_id;
  else
    update public.pessoas set
      tipo = coalesce(nullif(v_pessoa->>'tipo','')::public.pessoa_tipo, tipo),
      tipo_pessoa = coalesce(nullif(v_pessoa->>'tipo_pessoa','')::public.tipo_pessoa_enum, tipo_pessoa),
      nome = nullif(v_pessoa->>'nome',''),
      fantasia = nullif(v_pessoa->>'fantasia',''),
      doc_unico = nullif(v_pessoa->>'doc_unico',''),
      email = nullif(v_pessoa->>'email',''),
      telefone = nullif(v_pessoa->>'telefone',''),
      celular = nullif(v_pessoa->>'celular',''),
      site = nullif(v_pessoa->>'site',''),
      inscr_estadual = nullif(v_pessoa->>'inscr_estadual',''),
      isento_ie = coalesce(nullif(v_pessoa->>'isento_ie','')::boolean, false),
      inscr_municipal = nullif(v_pessoa->>'inscr_municipal',''),
      observacoes = nullif(v_pessoa->>'observacoes',''),
      codigo_externo = nullif(v_pessoa->>'codigo_externo',''),
      contribuinte_icms = coalesce(nullif(v_pessoa->>'contribuinte_icms','')::public.contribuinte_icms_enum, '9'::public.contribuinte_icms_enum),
      contato_tags = case when jsonb_typeof(v_pessoa->'contato_tags') = 'array'
        then array(select jsonb_array_elements_text(v_pessoa->'contato_tags'))
        else contato_tags
      end,
      limite_credito = nullif(v_pessoa->>'limite_credito','')::numeric,
      condicao_pagamento = nullif(v_pessoa->>'condicao_pagamento',''),
      informacoes_bancarias = nullif(v_pessoa->>'informacoes_bancarias',''),
      deleted_at = null
    where id = v_pessoa_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Parceiro nao encontrado ou fora da empresa.' using errcode = '23503';
    end if;
  end if;

  -- Enderecos: replace set semantics only if payload is array
  if jsonb_typeof(v_enderecos) = 'array' then
    for v_endereco in select * from jsonb_array_elements(v_enderecos)
    loop
      if nullif(v_endereco->>'id','') is not null then
        update public.pessoa_enderecos set
          tipo_endereco = coalesce(nullif(v_endereco->>'tipo_endereco',''), tipo_endereco),
          logradouro = nullif(v_endereco->>'logradouro',''),
          numero = nullif(v_endereco->>'numero',''),
          complemento = nullif(v_endereco->>'complemento',''),
          bairro = nullif(v_endereco->>'bairro',''),
          cidade = nullif(v_endereco->>'cidade',''),
          uf = nullif(v_endereco->>'uf',''),
          cep = nullif(v_endereco->>'cep',''),
          pais = nullif(v_endereco->>'pais',''),
          cidade_codigo = nullif(v_endereco->>'cidade_codigo',''),
          pais_codigo = nullif(v_endereco->>'pais_codigo','')
        where id = (v_endereco->>'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_endereco_ids := array_append(v_endereco_ids, (v_endereco->>'id')::uuid);
      else
        insert into public.pessoa_enderecos (
          empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais, cidade_codigo, pais_codigo
        ) values (
          v_empresa_id, v_pessoa_id,
          coalesce(nullif(v_endereco->>'tipo_endereco',''), 'PRINCIPAL'),
          nullif(v_endereco->>'logradouro',''),
          nullif(v_endereco->>'numero',''),
          nullif(v_endereco->>'complemento',''),
          nullif(v_endereco->>'bairro',''),
          nullif(v_endereco->>'cidade',''),
          nullif(v_endereco->>'uf',''),
          nullif(v_endereco->>'cep',''),
          nullif(v_endereco->>'pais',''),
          nullif(v_endereco->>'cidade_codigo',''),
          coalesce(nullif(v_endereco->>'pais_codigo',''), '1058')
        );
      end if;
    end loop;

    delete from public.pessoa_enderecos
    where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id
      and (array_length(v_endereco_ids, 1) is null or id <> all(v_endereco_ids));
  end if;

  -- Contatos: replace set semantics only if payload is array
  if jsonb_typeof(v_contatos) = 'array' then
    for v_contato in select * from jsonb_array_elements(v_contatos)
    loop
      if nullif(v_contato->>'id','') is not null then
        update public.pessoa_contatos set
          nome = nullif(v_contato->>'nome',''),
          email = nullif(v_contato->>'email',''),
          telefone = nullif(v_contato->>'telefone',''),
          cargo = nullif(v_contato->>'cargo',''),
          observacoes = nullif(v_contato->>'observacoes','')
        where id = (v_contato->>'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_contato_ids := array_append(v_contato_ids, (v_contato->>'id')::uuid);
      else
        insert into public.pessoa_contatos (
          empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes
        ) values (
          v_empresa_id, v_pessoa_id,
          nullif(v_contato->>'nome',''),
          nullif(v_contato->>'email',''),
          nullif(v_contato->>'telefone',''),
          nullif(v_contato->>'cargo',''),
          nullif(v_contato->>'observacoes','')
        );
      end if;
    end loop;

    delete from public.pessoa_contatos
    where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id
      and (array_length(v_contato_ids, 1) is null or id <> all(v_contato_ids));
  end if;

  return public.get_partner_details(v_pessoa_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Emissão: natureza da operação no cabeçalho (rascunho)
-- ---------------------------------------------------------------------------
alter table public.fiscal_nfe_emissoes
  add column if not exists natureza_operacao text;

-- ---------------------------------------------------------------------------
-- 4) Produtos: atualizar RPCs para incluir defaults fiscais
-- ---------------------------------------------------------------------------
create or replace function public.create_product_for_current_user(payload jsonb)
returns public.produtos
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
    marca_id, tabela_medidas_id, produto_pai_id, grupo_id, descricao_complementar, video_url, slug,
    seo_titulo, seo_descricao, keywords, itens_por_caixa, preco_custo, garantia_meses, markup,
    permitir_inclusao_vendas, gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas, sku, gtin, descricao,
    cfop_padrao, cst_padrao, csosn_padrao
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
  returning * into new_produto;

  perform pg_notify('app_log', '[RPC] [CREATE_PRODUCT] ' || new_produto.id::text);
  return new_produto;
end;
$function$;

create or replace function public.update_product_for_current_user(p_id uuid, patch jsonb)
returns public.produtos
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
    cfop_padrao          = case when patch ? 'cfop_padrao' then nullif(patch->>'cfop_padrao','') else cfop_padrao end,
    cst_padrao           = case when patch ? 'cst_padrao' then nullif(patch->>'cst_padrao','') else cst_padrao end,
    csosn_padrao         = case when patch ? 'csosn_padrao' then nullif(patch->>'csosn_padrao','') else csosn_padrao end
  where id = p_id
  returning * into updated_produto;

  if updated_produto.id is null then
    raise exception 'Produto não encontrado' using errcode = '02000';
  end if;

  perform pg_notify('app_log', '[RPC] [UPDATE_PRODUCT] ' || updated_produto.id::text);
  return updated_produto;
end;
$function$;

create or replace function public.create_product_clone_for_current_user(p_source_product_id uuid, p_overrides jsonb default '{}'::jsonb)
returns public.produtos
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_src public.produtos;
  v_payload jsonb;
  v_base_sku text;
  v_candidate_sku text;
  v_i int := 1;
  v_new public.produtos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CLONE_PRODUCT] empresa_id inválido para a sessão' using errcode='42501';
  end if;

  select * into v_src
  from public.produtos p
  where p.id = p_source_product_id
    and p.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][CLONE_PRODUCT] produto não encontrado na empresa atual' using errcode='P0002';
  end if;

  v_payload := to_jsonb(v_src)
    - 'id' - 'empresa_id' - 'created_at' - 'updated_at' - 'principal_image_id';

  v_payload := v_payload
    || jsonb_build_object('nome', coalesce(p_overrides->>'nome', 'Cópia de ' || coalesce(v_src.nome, 'Produto')))
    || jsonb_build_object('status', 'inativo');

  v_base_sku := nullif(coalesce(p_overrides->>'sku', nullif(v_src.sku, '') || '-copy'), '');
  if v_base_sku is not null then
    v_candidate_sku := v_base_sku;
    while exists (select 1 from public.produtos where empresa_id = v_empresa_id and sku = v_candidate_sku) loop
      v_i := v_i + 1;
      v_candidate_sku := v_base_sku || '-' || v_i::text;
    end loop;
    v_payload := v_payload || jsonb_build_object('sku', v_candidate_sku);
  else
    v_payload := v_payload || jsonb_build_object('sku', null);
  end if;

  v_payload := v_payload || jsonb_build_object('principal_image_id', null);
  v_payload := v_payload || jsonb_build_object('gtin', null);

  insert into public.produtos (
    empresa_id, nome, tipo, status, unidade, preco_venda, moeda,
    icms_origem, ncm, cest, tipo_embalagem, embalagem,
    peso_liquido_kg, peso_bruto_kg, num_volumes, largura_cm, altura_cm, comprimento_cm, diametro_cm,
    controla_estoque, estoque_min, estoque_max, controlar_lotes, localizacao, dias_preparacao,
    marca_id, tabela_medidas_id, produto_pai_id, descricao_complementar, video_url, slug,
    seo_titulo, seo_descricao, keywords, itens_por_caixa, preco_custo, garantia_meses, markup,
    permitir_inclusao_vendas, gtin_tributavel, unidade_tributavel, fator_conversao,
    codigo_enquadramento_ipi, valor_ipi_fixo, codigo_enquadramento_legal_ipi, ex_tipi,
    observacoes_internas, sku, gtin, descricao,
    cfop_padrao, cst_padrao, csosn_padrao
  ) values (
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
    nullif(v_payload->>'csosn_padrao','')
  )
  returning * into v_new;

  return v_new;
end;
$function$;

select pg_notify('pgrst', 'reload schema');

COMMIT;
