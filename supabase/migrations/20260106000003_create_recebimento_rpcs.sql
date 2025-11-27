/*
  # Recebimento RPCs
  
  ## Description
  Implements the business logic for the Receiving module.
  
  1. create_recebimento_from_xml: Generates a 'recebimento' record from a 'fiscal_nfe_imports' record.
  2. conferir_item_recebimento: Registers a physical count (blind check) for an item.
  3. finalizar_recebimento: Validates the receiving process and (if valid) updates stock.
*/

-- =============================================
-- 1. Create Recebimento from XML
-- =============================================
create or replace function public.create_recebimento_from_xml(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_recebimento_id uuid;
  v_item record;
  v_prod_id uuid;
begin
  -- 1. Check if already exists
  select id into v_recebimento_id
  from public.recebimentos
  where fiscal_nfe_import_id = p_import_id
    and empresa_id = v_emp;

  if v_recebimento_id is not null then
    return jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
  end if;

  -- 2. Create Header
  insert into public.recebimentos (empresa_id, fiscal_nfe_import_id, status)
  values (v_emp, p_import_id, 'pendente')
  returning id into v_recebimento_id;

  -- 3. Create Items (Copy from fiscal_nfe_import_items)
  for v_item in
    select * from public.fiscal_nfe_import_items
    where import_id = p_import_id and empresa_id = v_emp
  loop
    -- Try to match product (Same logic as preview)
    select id into v_prod_id
    from public.produtos p
    where p.empresa_id = v_emp
      and (
        (p.sku = v_item.cprod and v_item.cprod is not null and v_item.cprod <> '') or
        (p.gtin = v_item.ean and v_item.ean is not null and v_item.ean <> '')
      )
    limit 1;

    insert into public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml
    ) values (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom
    );
  end loop;

  return jsonb_build_object('id', v_recebimento_id, 'status', 'created');
end;
$$;

revoke all on function public.create_recebimento_from_xml from public;
grant execute on function public.create_recebimento_from_xml to authenticated, service_role;

-- =============================================
-- 2. Conferir Item (Blind Check)
-- =============================================
create or replace function public.conferir_item_recebimento(
  p_recebimento_item_id uuid,
  p_quantidade numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_total numeric;
begin
  -- Insert conference record
  insert into public.recebimento_conferencias (
    empresa_id, recebimento_item_id, quantidade_contada, usuario_id
  ) values (
    v_emp, p_recebimento_item_id, p_quantidade, public.current_user_id()
  );

  -- Update total checked in item
  select sum(quantidade_contada) into v_total
  from public.recebimento_conferencias
  where recebimento_item_id = p_recebimento_item_id;

  update public.recebimento_itens
  set quantidade_conferida = coalesce(v_total, 0),
      updated_at = now()
  where id = p_recebimento_item_id
    and empresa_id = v_emp;
    
  -- Update status of item (simple logic: if >= xml then ok)
  update public.recebimento_itens
  set status = case 
      when quantidade_conferida >= quantidade_xml then 'ok'
      else 'pendente'
    end
  where id = p_recebimento_item_id
    and empresa_id = v_emp;
end;
$$;

revoke all on function public.conferir_item_recebimento from public;
grant execute on function public.conferir_item_recebimento to authenticated, service_role;

-- =============================================
-- 3. Finalizar Recebimento
-- =============================================
create or replace function public.finalizar_recebimento(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_item record;
  v_divergente boolean := false;
  v_import_id uuid;
begin
  -- Check for divergences
  for v_item in
    select * from public.recebimento_itens
    where recebimento_id = p_recebimento_id and empresa_id = v_emp
  loop
    if v_item.quantidade_conferida <> v_item.quantidade_xml then
      v_divergente := true;
    end if;
  end loop;

  if v_divergente then
    update public.recebimentos set status = 'divergente', updated_at = now()
    where id = p_recebimento_id;
    return jsonb_build_object('status', 'divergente', 'message', 'Existem divergências na conferência.');
  end if;

  -- If all good, process stock entry
  select fiscal_nfe_import_id into v_import_id
  from public.recebimentos
  where id = p_recebimento_id;

  -- Call the existing stock processing function (reusing logic)
  -- Note: We assume the user wants to process it as 'beneficiamento' or standard entry.
  -- For now, we reuse the existing RPC which handles stock updates.
  perform public.beneficiamento_process_from_import(v_import_id);

  -- Update Recebimento Status
  update public.recebimentos set status = 'concluido', updated_at = now()
  where id = p_recebimento_id;

  return jsonb_build_object('status', 'concluido', 'message', 'Recebimento finalizado e estoque atualizado.');
end;
$$;

revoke all on function public.finalizar_recebimento from public;
grant execute on function public.finalizar_recebimento to authenticated, service_role;
