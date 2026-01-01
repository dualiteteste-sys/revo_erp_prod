/*
  MELI-04: Permitir canal 'marketplace' ao editar pedido via UI (RPC vendas_upsert_pedido)

  Observação: imports do marketplace não usam essa RPC (service_role escreve direto),
  mas isso evita erro caso alguém edite um pedido com canal marketplace.
*/

BEGIN;

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
  v_canal     text := nullif(p_payload->>'canal','');
  v_vendedor  uuid := nullif(p_payload->>'vendedor_id','')::uuid;
  v_com_pct   numeric := nullif(p_payload->>'comissao_percent','')::numeric;
begin
  v_cliente := (p_payload->>'cliente_id')::uuid;
  if v_cliente is null then
    raise exception 'cliente_id é obrigatório.';
  end if;

  if not exists (
    select 1 from public.pessoas c where c.id = v_cliente
  ) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_status := coalesce(p_payload->>'status', 'orcamento');
  if v_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

  v_data_emis := coalesce(
    (p_payload->>'data_emissao')::date,
    current_date
  );
  v_data_ent  := (p_payload->>'data_entrega')::date;

  v_frete := coalesce((p_payload->>'frete')::numeric, 0);
  v_desc  := coalesce((p_payload->>'desconto')::numeric, 0);

  if v_canal is not null and v_canal not in ('erp','pdv','marketplace') then
    raise exception 'Canal inválido.';
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
      canal              = coalesce(v_canal, p.canal),
      vendedor_id        = coalesce(v_vendedor, p.vendedor_id),
      comissao_percent   = coalesce(v_com_pct, p.comissao_percent)
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
      canal,
      vendedor_id,
      comissao_percent
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
      coalesce(v_canal,'erp'),
      v_vendedor,
      coalesce(v_com_pct, 0)
    ) returning id into v_id;
  end if;

  perform public.vendas_recalcular_totais(v_id);
  return public.vendas_get_pedido_details(v_id);
end;
$$;

revoke all on function public.vendas_upsert_pedido(jsonb) from public;
grant execute on function public.vendas_upsert_pedido(jsonb) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

