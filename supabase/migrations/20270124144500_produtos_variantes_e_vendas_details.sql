-- Produto: variações (produto_pai_id + atributos) + melhorias no vendas_get_pedido_details
-- "Estado da arte": RPC-first, multi-tenant, transactions e defaults seguros.

begin;

-- 1) Atributos: RPCs utilitários
create or replace function public.atributos_list_for_current_user(p_q text default null)
returns table(id uuid, nome text, tipo text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  return query
  select a.id, a.nome, a.tipo, a.created_at, a.updated_at
  from public.atributos a
  where a.empresa_id = v_empresa
    and (p_q is null or a.nome ilike '%'||p_q||'%')
  order by a.nome;
end;
$$;

create or replace function public.atributos_ensure(p_nome text, p_tipo text default 'text')
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_nome text := nullif(trim(p_nome),'');
  v_tipo text := coalesce(nullif(trim(p_tipo),''), 'text');
begin
  if v_nome is null then
    raise exception 'Nome do atributo é obrigatório.';
  end if;

  insert into public.atributos (empresa_id, nome, tipo)
  values (v_empresa, v_nome, v_tipo)
  on conflict (id) do nothing;

  select a.id into v_id
  from public.atributos a
  where a.empresa_id = v_empresa and lower(a.nome) = lower(v_nome)
  order by a.created_at desc
  limit 1;

  if v_id is null then
    insert into public.atributos (empresa_id, nome, tipo)
    values (v_empresa, v_nome, v_tipo)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- 2) Variantes: listar filhos e criar em lote
create or replace function public.produtos_variantes_list_for_current_user(p_produto_pai_id uuid)
returns table(
  id uuid,
  nome text,
  sku text,
  status public.status_produto,
  unidade text,
  preco_venda numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_produto_pai_id is null then
    raise exception 'p_produto_pai_id é obrigatório.';
  end if;

  return query
  select p.id, p.nome, p.sku, p.status, p.unidade, p.preco_venda, p.created_at, p.updated_at
  from public.produtos p
  where p.empresa_id = v_empresa
    and p.produto_pai_id = p_produto_pai_id
  order by p.nome;
end;
$$;

create or replace function public.produtos_variantes_generate_for_current_user(
  p_produto_pai_id uuid,
  p_atributo_id uuid,
  p_valores_text text[],
  p_sku_suffix_mode text default 'slug' -- 'slug' | 'num'
)
returns table(variant_id uuid, variant_nome text, variant_sku text)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_parent public.produtos%rowtype;
  v_val text;
  v_nome text;
  v_sku text;
  v_sfx text;
  v_variant_id uuid;
  v_idx int := 0;
begin
  if p_produto_pai_id is null then
    raise exception 'p_produto_pai_id é obrigatório.';
  end if;
  if p_atributo_id is null then
    raise exception 'p_atributo_id é obrigatório.';
  end if;
  if p_valores_text is null or array_length(p_valores_text, 1) is null then
    raise exception 'Informe ao menos 1 valor.';
  end if;

  select * into v_parent
  from public.produtos p
  where p.id = p_produto_pai_id
    and p.empresa_id = v_empresa;

  if not found then
    raise exception 'Produto pai não encontrado.';
  end if;

  if v_parent.tipo = 'servico' then
    raise exception 'Serviços não suportam variações.';
  end if;

  if v_parent.produto_pai_id is not null then
    raise exception 'Este produto já é uma variação (não pode ser pai).';
  end if;

  foreach v_val in array p_valores_text loop
    v_val := nullif(trim(v_val), '');
    if v_val is null then
      continue;
    end if;

    v_idx := v_idx + 1;
    v_nome := v_parent.nome || ' - ' || v_val;

    if coalesce(nullif(trim(v_parent.sku),''), '') = '' then
      v_sku := null;
    else
      if p_sku_suffix_mode = 'num' then
        v_sfx := lpad(v_idx::text, 2, '0');
      else
        v_sfx := public._slugify_simple(v_val);
      end if;
      v_sku := trim(v_parent.sku) || '-' || v_sfx;
    end if;

    -- Create child product cloning core fields
    insert into public.produtos (
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
    ) values (
      v_empresa,
      v_parent.tipo,
      v_parent.status,
      v_nome,
      v_sku,
      v_parent.unidade,
      v_parent.preco_venda,
      v_parent.moeda,
      v_parent.icms_origem,
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
      v_parent.descricao,
      v_parent.descricao_complementar,
      v_parent.video_url,
      v_parent.slug,
      v_parent.seo_titulo,
      v_parent.seo_descricao,
      v_parent.keywords,
      v_parent.permitir_inclusao_vendas,
      v_parent.gtin,
      v_parent.gtin_tributavel,
      v_parent.unidade_tributavel,
      v_parent.fator_conversao,
      v_parent.codigo_enquadramento_ipi,
      v_parent.valor_ipi_fixo,
      v_parent.codigo_enquadramento_legal_ipi,
      v_parent.ex_tipi,
      v_parent.observacoes_internas
    )
    returning id into v_variant_id;

    -- Save attribute value for the variant
    insert into public.produto_atributos (
      empresa_id,
      produto_id,
      atributo_id,
      valor_text
    ) values (
      v_empresa,
      v_variant_id,
      p_atributo_id,
      v_val
    )
    on conflict (empresa_id, produto_id, atributo_id) do update set
      valor_text = excluded.valor_text,
      updated_at = now();

    variant_id := v_variant_id;
    variant_nome := v_nome;
    variant_sku := v_sku;
    return next;
  end loop;
end;
$$;

-- 3) Vendas: incluir unidade do produto e tabela_preco_id
create or replace function public.vendas_get_pedido_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido  jsonb;
  v_itens   jsonb;
begin
  select
    to_jsonb(p.*)
    || jsonb_build_object('cliente_nome', c.nome)
  into v_pedido
  from public.vendas_pedidos p
  join public.pessoas c on c.id = p.cliente_id
  where p.id = p_id
    and p.empresa_id = v_empresa;

  if v_pedido is null then
    return null;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',        i.id,
               'pedido_id', i.pedido_id,
               'produto_id', i.produto_id,
               'produto_nome', pr.nome,
               'produto_unidade', pr.unidade,
               'produto_sku', pr.sku,
               'quantidade', i.quantidade,
               'preco_unitario', i.preco_unitario,
               'desconto', i.desconto,
               'total', i.total,
               'observacoes', i.observacoes
             )
             order by i.created_at, i.id
           ),
           '[]'::jsonb
         )
  into v_itens
  from public.vendas_itens_pedido i
  join public.produtos pr on pr.id = i.produto_id
  where i.pedido_id = p_id
    and i.empresa_id = v_empresa;

  return v_pedido || jsonb_build_object('itens', v_itens);
end;
$$;

-- 4) Vendas: suportar tabela_preco_id no upsert (mantém compat)
create or replace function public.vendas_upsert_pedido(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_empresa   uuid := public.current_empresa_id();
  v_id        uuid;
  v_cliente   uuid;
  v_status    text;
  v_data_emis date;
  v_data_ent  date;
  v_frete     numeric;
  v_desc      numeric;
  v_tp        uuid;
begin
  v_cliente := (p_payload->>'cliente_id')::uuid;
  if v_cliente is null then
    raise exception 'cliente_id é obrigatório.';
  end if;

  if not exists (select 1 from public.pessoas c where c.id = v_cliente) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_status := coalesce(p_payload->>'status', 'orcamento');
  if v_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

  v_data_emis := coalesce((p_payload->>'data_emissao')::date, current_date);
  v_data_ent  := (p_payload->>'data_entrega')::date;

  v_frete := coalesce((p_payload->>'frete')::numeric, 0);
  v_desc  := coalesce((p_payload->>'desconto')::numeric, 0);

  v_tp := nullif(p_payload->>'tabela_preco_id','')::uuid;
  if v_tp is not null then
    if not exists (
      select 1 from public.tabelas_preco t
      where t.id = v_tp and t.empresa_id = v_empresa and t.status = 'ativa'
    ) then
      v_tp := null;
    end if;
  end if;

  if p_payload->>'id' is not null then
    update public.vendas_pedidos p
    set
      cliente_id         = v_cliente,
      data_emissao       = v_data_emis,
      data_entrega       = v_data_ent,
      status             = v_status,
      frete              = v_frete,
      desconto           = v_desc,
      condicao_pagamento = p_payload->>'condicao_pagamento',
      observacoes        = p_payload->>'observacoes',
      tabela_preco_id    = v_tp
    where p.id = (p_payload->>'id')::uuid
      and p.empresa_id = v_empresa
    returning p.id into v_id;
  else
    insert into public.vendas_pedidos (
      empresa_id,
      cliente_id,
      data_emissao,
      data_entrega,
      status,
      frete,
      desconto,
      condicao_pagamento,
      observacoes,
      tabela_preco_id
    ) values (
      v_empresa,
      v_cliente,
      v_data_emis,
      v_data_ent,
      v_status,
      v_frete,
      v_desc,
      p_payload->>'condicao_pagamento',
      p_payload->>'observacoes',
      v_tp
    )
    returning id into v_id;
  end if;

  perform public.vendas_recalcular_totais(v_id);

  perform pg_notify('app_log', '[RPC] vendas_upsert_pedido: ' || v_id);

  return public.vendas_get_pedido_details(v_id);
end;
$$;

commit;

