/*
  Financeiro: Meios de Pagamento/Recebimento — Bulk add/upsert

  Objetivo:
  - Permitir cadastro rápido em massa (um por linha) com idempotência.
  - Evitar múltiplas chamadas RPC no front ao cadastrar dezenas de itens.

  Regras:
  - Multi-tenant via current_empresa_id()
  - Respeita permissions (create) por tipo
  - Idempotente por (empresa_id, lower(nome), tipo) => atualiza ativo se já existir
*/

begin;

drop function if exists public.financeiro_meios_pagamento_bulk_upsert(jsonb);
create or replace function public.financeiro_meios_pagamento_bulk_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_tipo public.financeiro_meio_pagamento_tipo := nullif(p_payload->>'tipo','')::public.financeiro_meio_pagamento_tipo;
  v_ativo boolean := coalesce((p_payload->>'ativo')::boolean, true);
  v_limit int := greatest(1, least(coalesce((p_payload->>'limit')::int, 500), 1000));
  v_total int := 0;
  v_inserted int := 0;
  v_updated int := 0;
begin
  if v_tipo is null then
    raise exception '[FIN][MEIOS] tipo é obrigatório.' using errcode='P0001';
  end if;

  if v_tipo = 'pagamento' then
    perform public.require_permission_for_current_user('contas_a_pagar','create');
  else
    perform public.require_permission_for_current_user('contas_a_receber','create');
  end if;

  with raw as (
    select
      row_number() over () as rn,
      btrim(value) as nome
    from jsonb_array_elements_text(coalesce(p_payload->'nomes','[]'::jsonb)) t(value)
  ),
  cleaned as (
    select distinct on (lower(nome))
      nome
    from raw
    where nome is not null and nome <> ''
    order by lower(nome), nome
    limit v_limit
  ),
  up as (
    insert into public.financeiro_meios_pagamento (empresa_id, tipo, nome, ativo, is_system)
    select v_empresa, v_tipo, c.nome, v_ativo, false
    from cleaned c
    on conflict (empresa_id, lower(nome), tipo)
    do update set
      ativo = excluded.ativo,
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select
    (select count(*) from cleaned),
    (select count(*) from up where inserted),
    (select count(*) from up where not inserted)
  into v_total, v_inserted, v_updated;

  return jsonb_build_object(
    'ok', true,
    'tipo', v_tipo::text,
    'ativo', v_ativo,
    'total', v_total,
    'inserted', v_inserted,
    'updated', v_updated
  );
end;
$$;

revoke all on function public.financeiro_meios_pagamento_bulk_upsert(jsonb) from public, anon;
grant execute on function public.financeiro_meios_pagamento_bulk_upsert(jsonb) to authenticated, service_role;

commit;

