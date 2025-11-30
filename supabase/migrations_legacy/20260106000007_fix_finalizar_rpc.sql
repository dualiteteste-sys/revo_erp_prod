/*
  # Fix Finalizar Recebimento RPC
  
  ## Description
  Updates the `finalizar_recebimento` function to correctly pass product mappings to `beneficiamento_process_from_import`.
  Previously, it was ignoring the `produto_id` stored in `recebimento_itens`, causing "Item sem mapeamento" errors during finalization if the product wasn't automatically matched by SKU/EAN.
*/

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
  v_matches jsonb;
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

  -- Construct matches from recebimento_itens
  select jsonb_agg(
           jsonb_build_object(
             'item_id', ri.fiscal_nfe_item_id,
             'produto_id', ri.produto_id
           )
         )
  into v_matches
  from public.recebimento_itens ri
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null;

  -- Call the existing stock processing function with matches
  perform public.beneficiamento_process_from_import(v_import_id, coalesce(v_matches, '[]'::jsonb));

  -- Update Recebimento Status
  update public.recebimentos set status = 'concluido', updated_at = now()
  where id = p_recebimento_id;

  return jsonb_build_object('status', 'concluido', 'message', 'Recebimento finalizado e estoque atualizado.');
end;
$$;
