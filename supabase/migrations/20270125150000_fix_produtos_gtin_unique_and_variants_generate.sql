-- Fix: GTIN unique index must ignore blank values, and variants generation must not clone blank GTIN.
-- This avoids 23505 (idx_produtos_gtin_unique) when generating variants from products with empty GTIN.

-- 1) Normalize existing data (treat blank as NULL)
update public.produtos
set gtin = null
where gtin is not null
  and btrim(gtin) = '';

update public.produtos
set gtin_tributavel = null
where gtin_tributavel is not null
  and btrim(gtin_tributavel) = '';

-- 2) Recreate unique index excluding blanks
drop index if exists public.idx_produtos_gtin_unique;
create unique index if not exists idx_produtos_gtin_unique
  on public.produtos using btree (gtin)
  where gtin is not null
    and btrim(gtin) <> '';

-- 3) Ensure variants generator does not copy blank GTINs from parent
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
      nullif(btrim(v_parent.gtin), ''),
      nullif(btrim(v_parent.gtin_tributavel), ''),
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

select pg_notify('pgrst', 'reload schema');
