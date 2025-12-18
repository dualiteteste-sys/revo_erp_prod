/*
  # Recebimento: permitir reimportar XML quando recebimento está cancelado

  Problema:
  - Ao importar novamente um XML cuja NF-e já teve recebimento criado e posteriormente cancelado,
    o fluxo de importação redireciona para o recebimento existente e bloqueia o reprocessamento.

  Solução:
  - Se existir recebimento para o mesmo `fiscal_nfe_import_id`:
    - Se `status <> 'cancelado'`: mantém comportamento atual (retorna 'exists').
    - Se `status = 'cancelado'`: "reabre" o recebimento (limpa flags de cancelamento, remove itens/conferências)
      e recria os itens a partir do XML, retornando 'reopened'.
*/

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
  v_recebimento_status text;
  v_item record;
  v_prod_id uuid;
begin
  select id, status
    into v_recebimento_id, v_recebimento_status
  from public.recebimentos
  where fiscal_nfe_import_id = p_import_id
    and empresa_id = v_emp;

  if v_recebimento_id is not null then
    if v_recebimento_status is distinct from 'cancelado' then
      return jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
    end if;

    -- Recebimento cancelado: reabrir e recriar itens/conferências
    delete from public.recebimento_conferencias rc
    where rc.empresa_id = v_emp
      and rc.recebimento_item_id in (
        select ri.id
        from public.recebimento_itens ri
        where ri.empresa_id = v_emp
          and ri.recebimento_id = v_recebimento_id
      );

    delete from public.recebimento_itens ri
    where ri.empresa_id = v_emp
      and ri.recebimento_id = v_recebimento_id;

    update public.recebimentos
    set status = 'pendente',
        data_recebimento = now(),
        responsavel_id = null,
        cancelado_at = null,
        cancelado_por = null,
        cancelado_motivo = null,
        updated_at = now()
    where id = v_recebimento_id
      and empresa_id = v_emp;

  else
    insert into public.recebimentos (empresa_id, fiscal_nfe_import_id, status)
    values (v_emp, p_import_id, 'pendente')
    returning id into v_recebimento_id;
  end if;

  for v_item in
    select * from public.fiscal_nfe_import_items
    where import_id = p_import_id and empresa_id = v_emp
  loop
    select id into v_prod_id
    from public.produtos p
    where p.empresa_id = v_emp
      and (
        (p.sku = v_item.cprod and coalesce(v_item.cprod,'') <> '') or
        (p.gtin = v_item.ean and coalesce(v_item.ean,'') <> '')
      )
    limit 1;

    insert into public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml
    ) values (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom
    );
  end loop;

  if v_recebimento_status = 'cancelado' then
    return jsonb_build_object('id', v_recebimento_id, 'status', 'reopened');
  end if;

  return jsonb_build_object('id', v_recebimento_id, 'status', 'created');
end;
$$;

revoke all on function public.create_recebimento_from_xml(uuid) from public;
grant execute on function public.create_recebimento_from_xml(uuid) to authenticated, service_role;

