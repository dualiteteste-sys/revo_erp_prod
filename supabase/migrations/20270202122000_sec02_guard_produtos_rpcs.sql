-- SEC-02: garantir guard de permissão em RPCs SECURITY DEFINER (Produtos)
-- Motivo: o RG-03 falha se funções SECURITY DEFINER usadas pelo app não chamarem
-- `require_permission_for_current_user(...)` (anti-burla via console).
--
-- Alvos:
-- - public.produtos_variantes_generate_for_current_user(...): exige `produtos:update`
-- - public.delete_product_for_current_user(uuid): exige `produtos:delete`

BEGIN;

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
  v_slug text;
  v_nome text;
  v_base_sku text;
  v_candidate_sku text;
  v_variant_id uuid;
  v_existing_id uuid;
  v_existing_parent_id uuid;
  v_idx int := 0;
  v_try int;
  v_max_tries int := 9999;
  v_sku_ok boolean := false;
  v_seen_slugs text[] := array[]::text[];
begin
  perform public.require_permission_for_current_user('produtos','update');

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

    v_slug := nullif(public._slugify_simple(v_val), '');
    if v_slug is null then
      continue;
    end if;

    -- evita duplicidade quando o input tem valores repetidos ou que "slugificam" igual
    if v_seen_slugs @> array[v_slug] then
      continue;
    end if;
    v_seen_slugs := array_append(v_seen_slugs, v_slug);

    v_idx := v_idx + 1;
    v_nome := v_parent.nome || ' - ' || v_val;

    if coalesce(nullif(trim(v_parent.sku), ''), '') = '' then
      v_base_sku := 'VAR' || lpad(v_parent.id::text, 8, '0');
    else
      v_base_sku := trim(v_parent.sku);
    end if;

    v_sku_ok := false;
    v_try := 0;
    while v_try <= v_max_tries loop
      if p_sku_suffix_mode = 'num' then
        v_candidate_sku := v_base_sku || '-' || lpad((v_idx + v_try)::text, 2, '0');
      else
        if v_try = 0 then
          v_candidate_sku := v_base_sku || '-' || v_slug;
        else
          v_candidate_sku := v_base_sku || '-' || v_slug || '-' || lpad(v_try::text, 2, '0');
        end if;
      end if;

      select id, produto_pai_id
      into v_existing_id, v_existing_parent_id
      from public.produtos
      where empresa_id = v_empresa
        and sku = v_candidate_sku
      limit 1;

      if not found then
        v_sku_ok := true;
        exit;
      end if;

      -- SKU existe. Se é variação do mesmo pai, reutiliza/atualiza.
      if v_existing_parent_id = p_produto_pai_id then
        v_variant_id := v_existing_id;
        v_sku_ok := true;
        exit;
      end if;

      v_try := v_try + 1;
    end loop;

    if not v_sku_ok then
      raise exception 'Não foi possível gerar um SKU único para a variação "%". Verifique se há conflitos de SKU e tente novamente.', v_val;
    end if;

    if v_variant_id is null then
      insert into public.produtos(
        empresa_id,
        produto_pai_id,
        nome,
        sku,
        status,
        tipo,
        unidade,
        preco_venda,
        descricao,
        grupo_id
      )
      values(
        v_empresa,
        p_produto_pai_id,
        v_nome,
        v_candidate_sku,
        v_parent.status,
        v_parent.tipo,
        v_parent.unidade,
        v_parent.preco_venda,
        v_parent.descricao,
        v_parent.grupo_id
      )
      returning id into v_variant_id;
    else
      update public.produtos
      set
        nome = v_nome,
        status = v_parent.status,
        tipo = v_parent.tipo,
        unidade = v_parent.unidade,
        preco_venda = v_parent.preco_venda,
        descricao = v_parent.descricao,
        grupo_id = v_parent.grupo_id
      where id = v_variant_id
        and empresa_id = v_empresa;
    end if;

    -- upsert atributo/valor da variação
    insert into public.produtos_variantes_atributos(
      empresa_id,
      produto_id,
      atributo_id,
      valor_text,
      valor_slug
    )
    values(
      v_empresa,
      v_variant_id,
      p_atributo_id,
      v_val,
      v_slug
    )
    on conflict (empresa_id, produto_id, atributo_id)
    do update set
      valor_text = excluded.valor_text,
      valor_slug = excluded.valor_slug;

    variant_id := v_variant_id;
    variant_nome := v_nome;
    variant_sku := v_candidate_sku;
    return next;

    v_variant_id := null;
  end loop;
end;
$$;

create or replace function public.delete_product_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  perform public.require_permission_for_current_user('produtos','delete');

  select empresa_id into v_empresa_id from public.produtos where id = p_id;
  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado. Usuário não pertence à empresa do produto.';
  end if;

  begin
    delete from public.produtos where id = p_id;
  exception
    when foreign_key_violation then
      raise exception 'Não é possível excluir este produto porque ele já foi utilizado em outros módulos (ex.: vendas). Inative o produto em vez de excluir.';
  end;
end;
$$;

revoke all on function public.produtos_variantes_generate_for_current_user(uuid, uuid, text[], text) from public;
grant execute on function public.produtos_variantes_generate_for_current_user(uuid, uuid, text[], text) to authenticated;

revoke all on function public.delete_product_for_current_user(uuid) from public;
grant execute on function public.delete_product_for_current_user(uuid) to authenticated;

COMMIT;

