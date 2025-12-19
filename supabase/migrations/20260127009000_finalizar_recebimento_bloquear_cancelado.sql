/*
  # Recebimento: bloquear finalização quando cancelado

  Problema:
  - A RPC `finalizar_recebimento` não validava o status atual.
  - Isso permitia "finalizar" um recebimento cancelado e efetivamente "descancelar" no fluxo.

  Solução:
  - Impede finalizar quando status = 'cancelado'.
  - Retorna early quando status = 'concluido' (idempotência).
*/

create schema if not exists public;

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
  v_classificacao text;
  v_cliente_id uuid;
  v_sync jsonb;
  v_sync_count int := 0;
  v_mov jsonb;
  v_status text;
begin
  select status, fiscal_nfe_import_id, classificacao, cliente_id
    into v_status, v_import_id, v_classificacao, v_cliente_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  for update;

  if v_status is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_status = 'cancelado' then
    return jsonb_build_object('status','cancelado','message','Recebimento cancelado não pode ser finalizado.');
  end if;

  if v_status = 'concluido' then
    return jsonb_build_object('status','concluido','message','Recebimento já concluído.');
  end if;

  -- Divergência
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

  -- Precisa ter produtos vinculados (senão não consegue lançar estoque)
  if exists (
    select 1 from public.recebimento_itens
    where recebimento_id = p_recebimento_id
      and empresa_id = v_emp
      and produto_id is null
  ) then
    return jsonb_build_object('status','pendente_vinculos','message','Vincule um produto do sistema para todos os itens antes de finalizar.');
  end if;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_classificacao is null then
    return jsonb_build_object(
      'status','pendente_classificacao',
      'message','Classifique o recebimento antes de concluir: Estoque Próprio ou Material do Cliente.'
    );
  end if;

  -- Mapeamento para beneficiamento (itens -> produto)
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

  if v_classificacao = 'material_cliente' then
    if v_cliente_id is null then
      return jsonb_build_object(
        'status','pendente_classificacao',
        'message','Para Material do Cliente, selecione o cliente/dono do material.'
      );
    end if;

    perform public.beneficiamento_process_from_import(v_import_id, coalesce(v_matches, '[]'::jsonb));

    begin
      v_sync := public.recebimento_sync_materiais_cliente(p_recebimento_id);
      v_sync_count := coalesce((v_sync->>'upserted')::int, 0);
    exception when others then
      v_sync := jsonb_build_object('status','error','error',SQLERRM);
      v_sync_count := 0;
    end;

    update public.recebimentos set status = 'concluido', updated_at = now()
    where id = p_recebimento_id;

    return jsonb_build_object(
      'status','concluido',
      'message',
        case
          when v_sync_count > 0 then
            'Recebimento concluído. Materiais de Cliente sincronizados ('||v_sync_count||').'
          else
            'Recebimento concluído.'
        end,
      'materiais_cliente_sync', v_sync
    );
  end if;

  -- estoque_proprio
  v_mov := public.estoque_process_from_recebimento(p_recebimento_id);

  update public.recebimentos set status = 'concluido', updated_at = now()
  where id = p_recebimento_id;

  return jsonb_build_object(
    'status','concluido',
    'message','Recebimento concluído e estoque atualizado.',
    'estoque', v_mov
  );
end;
$$;

revoke all on function public.finalizar_recebimento(uuid) from public;
grant execute on function public.finalizar_recebimento(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

