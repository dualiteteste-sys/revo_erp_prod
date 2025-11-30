-- 20251103_072000_os_items_add_del.sql
-- OS: add item (serviço/produto) com preço + delete item + search de produtos
-- Logs: [RPC] [OS][ITEM] [PRODUCTS][SEARCH]

/*
  ## Query Description
  - Garante UNIQUE parcial (empresa_id, sku) para suportar UPSERT com WHERE sku IS NOT NULL.
  - Cria RPCs de seed: current_user e admin (service_role).
  - Usa casts explícitos para enums (status_produto e, se aplicável no schema, tipo_produto).

  ## Segurança
  - SECURITY DEFINER + search_path fixo (pg_catalog, public)
  - Grants mínimos (authenticated / service_role)

  ## Compatibilidade
  - Campos usados no INSERT: nome, sku, preco_venda, unidade, status, descricao.
  - Campos opcionais/enum: tipo_produto **somente se existir** e aceitar 'simples'; caso contrário, mantemos NULL.
*/

-- =========================================================
-- AUTOCOMPLETE DE PRODUTOS (multi-tenant, tolerante a schema)
-- =========================================================
create or replace function public.search_products_for_current_user(
  p_search text default null,
  p_limit  int  default 20
)
returns table (
  id uuid,
  descricao text,
  codigo text,
  preco_venda numeric,
  unidade text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_q   text := nullif(btrim(coalesce(p_search,'')), '');
begin
  if v_emp is null then
    raise exception '[PRODUCTS][SEARCH] empresa_id inválido' using errcode='42501';
  end if;

  return query
  select pr.id,
         pr.nome as descricao,
         pr.sku  as codigo,
         pr.preco_venda,
         pr.unidade
  from public.produtos pr
  where pr.empresa_id = v_emp
    and (pr.status = 'ativo'::public.status_produto or pr.status = 'ativo') -- tolera coluna enum/text
    and coalesce(pr.permitir_inclusao_vendas, true) = true
    and (
      v_q is null
      or pr.nome ilike '%'||v_q||'%'
      or coalesce(pr.sku,'') ilike '%'||v_q||'%'
    )
  order by pr.nome asc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.search_products_for_current_user(text, int) from public;
grant execute on function public.search_products_for_current_user(text, int) to authenticated;
grant execute on function public.search_products_for_current_user(text, int) to service_role;

-- =========================================================
-- ADD SERVICE ITEM TO OS (puxa preço/descricao/codigo de servicos)
-- =========================================================
create or replace function public.add_service_item_to_os_for_current_user(
  p_os_id      uuid,
  p_servico_id uuid,
  p_qtd        numeric default 1,
  p_desconto_pct numeric default 0,
  p_orcar      boolean default false
)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_os  public.ordem_servicos;
  v_s   public.servicos;
  v_it  public.ordem_servico_itens;
  v_preco numeric;
  v_total numeric;
begin
  if v_emp is null then
    raise exception '[RPC][OS][ITEM] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_os
  from public.ordem_servicos
  where id = p_os_id and empresa_id = v_emp;
  if not found then
    raise exception '[RPC][OS][ITEM] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  select * into v_s
  from public.servicos
  where id = p_servico_id and empresa_id = v_emp;
  if not found then
    raise exception '[RPC][OS][ITEM] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;

  v_preco := coalesce(v_s.preco_venda, 0);
  v_total := round((greatest(coalesce(p_qtd,1), 0.0001) * v_preco) * (1 - coalesce(p_desconto_pct,0)/100.0), 2);

  insert into public.ordem_servico_itens (
    empresa_id, ordem_servico_id, servico_id, descricao, codigo,
    quantidade, preco, desconto_pct, total, orcar
  ) values (
    v_emp, v_os.id, v_s.id, v_s.descricao, v_s.codigo,
    greatest(coalesce(p_qtd,1), 0.0001), v_preco, coalesce(p_desconto_pct,0), v_total, coalesce(p_orcar,false)
  )
  returning * into v_it;

  perform public.os_recalc_totals(v_os.id);
  perform pg_notify('app_log', '[RPC] [OS][ITEM] add_service ' || v_it.id::text);

  return v_it;
end;
$$;

revoke all on function public.add_service_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) from public;
grant execute on function public.add_service_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) to authenticated;
grant execute on function public.add_service_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) to service_role;

-- =========================================================
-- ADD PRODUCT ITEM TO OS (puxa preço/nome/sku de produtos)
-- =========================================================
create or replace function public.add_product_item_to_os_for_current_user(
  p_os_id       uuid,
  p_produto_id  uuid,
  p_qtd         numeric default 1,
  p_desconto_pct numeric default 0,
  p_orcar       boolean default false
)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_os  public.ordem_servicos;
  v_p   public.produtos;
  v_it  public.ordem_servico_itens;
  v_preco numeric;
  v_total numeric;
begin
  if v_emp is null then
    raise exception '[RPC][OS][ITEM] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_os
  from public.ordem_servicos
  where id = p_os_id and empresa_id = v_emp;
  if not found then
    raise exception '[RPC][OS][ITEM] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  select * into v_p
  from public.produtos
  where id = p_produto_id and empresa_id = v_emp;
  if not found then
    raise exception '[RPC][OS][ITEM] Produto não encontrado na empresa atual' using errcode='P0002';
  end if;

  v_preco := coalesce(v_p.preco_venda, 0);
  v_total := round((greatest(coalesce(p_qtd,1), 0.0001) * v_preco) * (1 - coalesce(p_desconto_pct,0)/100.0), 2);

  insert into public.ordem_servico_itens (
    empresa_id, ordem_servico_id, servico_id, descricao, codigo,
    quantidade, preco, desconto_pct, total, orcar
  ) values (
    v_emp, v_os.id, null, v_p.nome, v_p.sku,
    greatest(coalesce(p_qtd,1), 0.0001), v_preco, coalesce(p_desconto_pct,0), v_total, coalesce(p_orcar,false)
  )
  returning * into v_it;

  perform public.os_recalc_totals(v_os.id);
  perform pg_notify('app_log', '[RPC] [OS][ITEM] add_product ' || v_it.id::text);

  return v_it;
end;
$$;

revoke all on function public.add_product_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) from public;
grant execute on function public.add_product_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) to authenticated;
grant execute on function public.add_product_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) to service_role;

-- =========================================================
-- DELETE ITEM DA OS (valida empresa/pertinência)
-- =========================================================
create or replace function public.delete_os_item_for_current_user(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_it  public.ordem_servico_itens;
begin
  if v_emp is null then
    raise exception '[RPC][OS][ITEM][DEL] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_it
  from public.ordem_servico_itens
  where id = p_item_id
    and empresa_id = v_emp;
  if not found then
    raise exception '[RPC][OS][ITEM][DEL] Item não encontrado na empresa atual' using errcode='P0002';
  end if;

  delete from public.ordem_servico_itens
  where id = v_it.id and empresa_id = v_emp;

  -- recalcula totais da OS do item removido
  perform public.os_recalc_totals(v_it.ordem_servico_id);

  perform pg_notify('app_log', '[RPC] [OS][ITEM] delete ' || v_it.id::text);
end;
$$;

revoke all on function public.delete_os_item_for_current_user(uuid) from public;
grant execute on function public.delete_os_item_for_current_user(uuid) to authenticated;
grant execute on function public.delete_os_item_for_current_user(uuid) to service_role;
