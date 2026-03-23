-- Bulk-link existing products as children of a parent product by SKU.
-- Used to fix imports where parent-child relationships were not established.

create or replace function public.produtos_vincular_filhos_por_sku(
  p_parent_sku text,
  p_child_skus text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_parent_id uuid;
  v_child_sku text;
  v_child_id uuid;
  v_linked int := 0;
  v_not_found text[] := '{}';
  v_already_linked text[] := '{}';
begin
  perform public.require_permission_for_current_user('produtos', 'update');

  if v_empresa is null then
    raise exception 'Empresa não identificada.' using errcode = '42501';
  end if;

  -- Resolve parent
  select id into v_parent_id
  from public.produtos
  where empresa_id = v_empresa
    and lower(sku) = lower(trim(p_parent_sku))
    and produto_pai_id is null
  limit 1;

  if v_parent_id is null then
    raise exception 'Produto pai com SKU "%" não encontrado.', p_parent_sku
      using errcode = 'P0001';
  end if;

  -- Link each child
  foreach v_child_sku in array p_child_skus loop
    v_child_sku := trim(v_child_sku);
    if v_child_sku = '' then continue; end if;

    select id into v_child_id
    from public.produtos
    where empresa_id = v_empresa
      and lower(sku) = lower(v_child_sku)
      and id <> v_parent_id
    limit 1;

    if v_child_id is null then
      v_not_found := array_append(v_not_found, v_child_sku);
      continue;
    end if;

    -- Check if already linked
    if exists (
      select 1 from public.produtos
      where id = v_child_id and produto_pai_id = v_parent_id
    ) then
      v_already_linked := array_append(v_already_linked, v_child_sku);
      continue;
    end if;

    update public.produtos
    set produto_pai_id = v_parent_id,
        updated_at = now()
    where id = v_child_id
      and empresa_id = v_empresa;

    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'parent_id', v_parent_id,
    'linked', v_linked,
    'not_found', to_jsonb(v_not_found),
    'already_linked', to_jsonb(v_already_linked)
  );
end;
$$;

revoke all on function public.produtos_vincular_filhos_por_sku(text, text[]) from public, anon;
grant execute on function public.produtos_vincular_filhos_por_sku(text, text[]) to authenticated, service_role;
