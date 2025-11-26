/*
  FIX RPC COLUMN ERROR
  Run this script in Supabase SQL Editor to update the functions with the correct column name (p.sku).
*/

-- 3.2) Preview (tenta casar itens com produtos por codigo ou ean)
create or replace function public.beneficiamento_preview(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_head  jsonb;
  v_itens jsonb;
begin
  select to_jsonb(i.*) - 'xml_raw' into v_head
  from public.fiscal_nfe_imports i
  where i.id = p_import_id
    and i.empresa_id = v_emp;

  if v_head is null then
    raise exception 'Import não encontrado.';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'item_id', fi.id,
             'n_item', fi.n_item,
             'cprod',  fi.cprod,
             'ean',    fi.ean,
             'xprod',  fi.xprod,
             'qcom',   fi.qcom,
             'vuncom', fi.vuncom,
             'vprod',  fi.vprod,
             'match_produto_id',
             (
               select p.id
               from public.produtos p
               where (p.sku = fi.cprod and fi.cprod is not null and fi.cprod <> '')
                  or (p.ean = fi.ean and fi.ean is not null and fi.ean <> '')
               limit 1
             ),
             'match_strategy',
             case
               when exists (select 1 from public.produtos p where p.sku = fi.cprod and fi.cprod is not null and fi.cprod <> '')
                 then 'sku'
               when exists (select 1 from public.produtos p where p.ean = fi.ean and fi.ean is not null and fi.ean <> '')
                 then 'ean'
               else 'none'
             end
           )
         ), '[]'::jsonb)
  into v_itens
  from public.fiscal_nfe_import_items fi
  where fi.import_id = p_import_id
    and fi.empresa_id = v_emp
  order by fi.n_item;

  return jsonb_build_object('import', v_head, 'itens', v_itens);
end;
$$;

revoke all on function public.beneficiamento_preview from public;
grant execute on function public.beneficiamento_preview to authenticated, service_role;

-- 3.3) Processar import → gerar entradas de beneficiamento (idempotente)
create or replace function public.beneficiamento_process_from_import(
  p_import_id uuid,
  p_matches   jsonb default '[]'::jsonb  -- [{item_id, produto_id}] para resolver pendências
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_stat  text;
  v_row   record;
  v_prod  uuid;
begin
  select status into v_stat
  from public.fiscal_nfe_imports
  where id = p_import_id
    and empresa_id = v_emp
  for update;

  if v_stat is null then
    raise exception 'Import não encontrado.';
  end if;

  -- idempotência: se já processado, apenas retorna
  if v_stat = 'processado' then
    return;
  end if;

  for v_row in
    select fi.*
    from public.fiscal_nfe_import_items fi
    where fi.import_id = p_import_id
      and fi.empresa_id = v_emp
    order by fi.n_item
  loop
    -- resolve produto:
    select p.id into v_prod
    from public.produtos p
    where (p.sku = v_row.cprod and v_row.cprod is not null and v_row.cprod <> '')
       or (p.ean    = v_row.ean   and v_row.ean   is not null and v_row.ean   <> '')
    limit 1;

    if v_prod is null and p_matches is not null then
      select (m->>'produto_id')::uuid into v_prod
      from jsonb_array_elements(p_matches) m
      where (m->>'item_id')::uuid = v_row.id;
    end if;

    if v_prod is null then
      raise exception 'Item % sem mapeamento de produto. Utilize preview e envie p_matches.', v_row.n_item;
    end if;

    -- insere movimento (ON CONFLICT pela unique de origem evita duplicação)
    insert into public.estoque_movimentos (
      empresa_id, produto_id, data_movimento,
      tipo_mov, quantidade, valor_unitario,
      origem_tipo, origem_id, observacoes
    ) values (
      v_emp, v_prod, current_date,
      'entrada_beneficiamento', v_row.qcom, v_row.vuncom,
      'nfe_beneficiamento', p_import_id,
      'NF-e entrada para beneficiamento - chave='||(
        select chave_acesso from public.fiscal_nfe_imports where id = p_import_id
      )
    )
    on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov) do update set
      quantidade     = excluded.quantidade,
      valor_unitario = excluded.valor_unitario,
      updated_at     = now();
  end loop;

  update public.fiscal_nfe_imports
  set status = 'processado', processed_at = now(), last_error = null
  where id = p_import_id
    and empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] beneficiamento_process_from_import: '||p_import_id);
exception
  when others then
    update public.fiscal_nfe_imports
    set status = 'erro', last_error = sqlerrm, updated_at = now()
    where id = p_import_id
      and empresa_id = v_emp;
    raise;
end;
$$;

revoke all on function public.beneficiamento_process_from_import from public;
grant execute on function public.beneficiamento_process_from_import to authenticated, service_role;
