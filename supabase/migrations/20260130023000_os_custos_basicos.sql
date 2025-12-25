/*
  OS: Custos básicos (MVP)

  - Adiciona custo estimado/real na Ordem de Serviço
  - Atualiza RPCs create/update para persistir via payload
*/

alter table public.ordem_servicos
  add column if not exists custo_estimado numeric(15,2) not null default 0,
  add column if not exists custo_real numeric(15,2) not null default 0;

create or replace function public.create_os_for_current_user(payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CREATE_OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  insert into public.ordem_servicos (
    empresa_id,
    numero,
    cliente_id,
    status,
    descricao,
    consideracoes_finais,
    data_inicio,
    data_prevista,
    hora,
    data_conclusao,
    desconto_valor,
    vendedor,
    comissao_percentual,
    comissao_valor,
    tecnico,
    orcar,
    forma_recebimento,
    meio,
    conta_bancaria,
    categoria_financeira,
    condicao_pagamento,
    observacoes,
    observacoes_internas,
    anexos,
    marcadores,
    ordem,
    custo_estimado,
    custo_real
  )
  values (
    v_empresa_id,
    coalesce(nullif(payload->>'numero','')::bigint, public.next_os_number_for_current_empresa()),
    nullif(payload->>'cliente_id','')::uuid,
    coalesce(nullif(payload->>'status','')::public.status_os, 'orcamento'),
    nullif(payload->>'descricao',''),
    nullif(payload->>'consideracoes_finais',''),
    nullif(payload->>'data_inicio','')::date,
    nullif(payload->>'data_prevista','')::date,
    nullif(payload->>'hora','')::time,
    nullif(payload->>'data_conclusao','')::date,
    coalesce(nullif(payload->>'desconto_valor','')::numeric, 0),
    nullif(payload->>'vendedor',''),
    nullif(payload->>'comissao_percentual','')::numeric,
    nullif(payload->>'comissao_valor','')::numeric,
    nullif(payload->>'tecnico',''),
    coalesce(nullif(payload->>'orcar','')::boolean, false),
    nullif(payload->>'forma_recebimento',''),
    nullif(payload->>'meio',''),
    nullif(payload->>'conta_bancaria',''),
    nullif(payload->>'categoria_financeira',''),
    nullif(payload->>'condicao_pagamento',''),
    nullif(payload->>'observacoes',''),
    nullif(payload->>'observacoes_internas',''),
    case when payload ? 'anexos' then array(select jsonb_array_elements_text(payload->'anexos')) else null end,
    case when payload ? 'marcadores' then array(select jsonb_array_elements_text(payload->'marcadores')) else null end,
    nullif(payload->>'ordem','')::int,
    coalesce(nullif(payload->>'custo_estimado','')::numeric, 0),
    coalesce(nullif(payload->>'custo_real','')::numeric, 0)
  )
  returning * into rec;

  perform public.os_recalc_totals(rec.id);
  return rec;
end;
$$;

revoke all on function public.create_os_for_current_user(jsonb) from public;
grant execute on function public.create_os_for_current_user(jsonb) to authenticated, service_role;

create or replace function public.update_os_for_current_user(p_id uuid, payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][UPDATE_OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  update public.ordem_servicos os
     set cliente_id            = case when payload ? 'cliente_id' then nullif(payload->>'cliente_id','')::uuid else os.cliente_id end,
         status                = coalesce(nullif(payload->>'status','')::public.status_os, os.status),
         descricao             = coalesce(nullif(payload->>'descricao',''), os.descricao),
         consideracoes_finais  = coalesce(nullif(payload->>'consideracoes_finais',''), os.consideracoes_finais),
         data_inicio           = case when payload ? 'data_inicio' then nullif(payload->>'data_inicio','')::date else os.data_inicio end,
         data_prevista         = case when payload ? 'data_prevista' then nullif(payload->>'data_prevista','')::date else os.data_prevista end,
         hora                  = case when payload ? 'hora' then nullif(payload->>'hora','')::time else os.hora end,
         data_conclusao        = case when payload ? 'data_conclusao' then nullif(payload->>'data_conclusao','')::date else os.data_conclusao end,
         desconto_valor        = coalesce(nullif(payload->>'desconto_valor','')::numeric, os.desconto_valor),
         vendedor              = coalesce(nullif(payload->>'vendedor',''), os.vendedor),
         comissao_percentual   = coalesce(nullif(payload->>'comissao_percentual','')::numeric, os.comissao_percentual),
         comissao_valor        = coalesce(nullif(payload->>'comissao_valor','')::numeric, os.comissao_valor),
         tecnico               = coalesce(nullif(payload->>'tecnico',''), os.tecnico),
         orcar                 = coalesce(nullif(payload->>'orcar','')::boolean, os.orcar),
         forma_recebimento     = coalesce(nullif(payload->>'forma_recebimento',''), os.forma_recebimento),
         condicao_pagamento    = coalesce(nullif(payload->>'condicao_pagamento',''), os.condicao_pagamento),
         observacoes           = coalesce(nullif(payload->>'observacoes',''), os.observacoes),
         observacoes_internas  = coalesce(nullif(payload->>'observacoes_internas',''), os.observacoes_internas),
         anexos                = case when payload ? 'anexos' then array(select jsonb_array_elements_text(payload->'anexos')) else os.anexos end,
         marcadores            = case when payload ? 'marcadores' then array(select jsonb_array_elements_text(payload->'marcadores')) else os.marcadores end,
         ordem                 = coalesce(nullif(payload->>'ordem','')::int, os.ordem),
         custo_estimado        = case when payload ? 'custo_estimado' then coalesce(nullif(payload->>'custo_estimado','')::numeric, 0) else os.custo_estimado end,
         custo_real            = case when payload ? 'custo_real' then coalesce(nullif(payload->>'custo_real','')::numeric, 0) else os.custo_real end,
         updated_at            = now()
   where os.id = p_id
     and os.empresa_id = v_empresa_id
  returning * into rec;

  if not found then
    raise exception '[RPC][UPDATE_OS] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  perform public.os_recalc_totals(p_id);
  return rec;
end;
$$;

revoke all on function public.update_os_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_os_for_current_user(uuid, jsonb) to authenticated, service_role;

