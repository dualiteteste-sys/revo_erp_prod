-- 20251102_190000_create_product_clone_rpc.sql
-- Clona produto da empresa atual com segurança (SECURITY DEFINER), status inicial 'inativo',
-- e NÃO copia imagens no MVP (principal_image_id = NULL). Evita overloads chamando INSERT direto.

create or replace function public.create_product_clone_for_current_user(
  p_source_product_id uuid,
  p_overrides jsonb default '{}'::jsonb
)
returns public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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

  -- garante que a origem pertence à empresa atual
  select * into v_src
  from public.produtos p
  where p.id = p_source_product_id
    and p.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][CLONE_PRODUCT] produto não encontrado na empresa atual' using errcode='P0002';
  end if;

  -- payload base: remove campos não clonáveis e imagem principal
  v_payload := to_jsonb(v_src)
    - 'id' - 'empresa_id' - 'created_at' - 'updated_at' - 'principal_image_id';

  -- nome sugerido e status inicial
  v_payload := v_payload
    || jsonb_build_object('nome', coalesce(p_overrides->>'nome', 'Cópia de ' || coalesce(v_src.nome, 'Produto')))
    || jsonb_build_object('status', 'inativo');

  -- SKU único por empresa (override > src||'-copy' > null)
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

  -- imagens NÃO são clonadas no MVP
  v_payload := v_payload || jsonb_build_object('principal_image_id', null);

  -- INSERT explícito (mesma lista da create_product_for_current_user(payload jsonb))
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
    v_payload->>'nome',
    nullif(v_payload->>'tipo','')::public.tipo_produto,
    nullif(v_payload->>'status','')::public.status_produto,
    v_payload->>'unidade',
    nullif(v_payload->>'preco_venda','')::numeric,
    v_payload->>'moeda',
    nullif(v_payload->>'icms_origem','')::integer,
    v_payload->>'ncm',
    v_payload->>'cest',
    nullif(v_payload->>'tipo_embalagem','')::public.tipo_embalagem,
    v_payload->>'embalagem',
    nullif(v_payload->>'peso_liquido_kg','')::numeric,
    nullif(v_payload->>'peso_bruto_kg','')::numeric,
    nullif(v_payload->>'num_volumes','')::integer,
    nullif(v_payload->>'largura_cm','')::numeric,
    nullif(v_payload->>'altura_cm','')::numeric,
    nullif(v_payload->>'comprimento_cm','')::numeric,
    nullif(v_payload->>'diametro_cm','')::numeric,
    nullif(v_payload->>'controla_estoque','')::boolean,
    nullif(v_payload->>'estoque_min','')::numeric,
    nullif(v_payload->>'estoque_max','')::numeric,
    nullif(v_payload->>'controlar_lotes','')::boolean,
    v_payload->>'localizacao',
    nullif(v_payload->>'dias_preparacao','')::integer,
    nullif(v_payload->>'marca_id','')::uuid,
    nullif(v_payload->>'tabela_medidas_id','')::uuid,
    nullif(v_payload->>'produto_pai_id','')::uuid,
    v_payload->>'descricao_complementar',
    v_payload->>'video_url',
    v_payload->>'slug',
    v_payload->>'seo_titulo',
    v_payload->>'seo_descricao',
    v_payload->>'keywords',
    nullif(v_payload->>'itens_por_caixa','')::integer,
    nullif(v_payload->>'preco_custo','')::numeric,
    nullif(v_payload->>'garantia_meses','')::integer,
    nullif(v_payload->>'markup','')::numeric,
    nullif(v_payload->>'permitir_inclusao_vendas','')::boolean,
    v_payload->>'gtin_tributavel',
    v_payload->>'unidade_tributavel',
    nullif(v_payload->>'fator_conversao','')::numeric,
    v_payload->>'codigo_enquadramento_ipi',
    nullif(v_payload->>'valor_ipi_fixo','')::numeric,
    v_payload->>'codigo_enquadramento_legal_ipi',
    v_payload->>'ex_tipi',
    v_payload->>'observacoes_internas',
    v_payload->>'sku',
    v_payload->>'gtin',
    v_payload->>'descricao'
  )
  returning * into v_new;

  perform pg_notify('app_log', '[RPC] [CREATE_PRODUCT_CLONE] ' || v_new.id::text);
  return v_new;
end;
$$;

revoke all on function public.create_product_clone_for_current_user(uuid, jsonb) from public;
grant execute on function public.create_product_clone_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.create_product_clone_for_current_user(uuid, jsonb) to service_role;
