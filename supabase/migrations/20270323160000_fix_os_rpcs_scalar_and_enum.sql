-- Fix P1: update_os_for_current_user 'cannot extract elements from a scalar'
-- When payload has "anexos": null or "marcadores": null, payload ? 'key' returns true
-- but jsonb_array_elements_text(null) fails with "cannot extract elements from a scalar".
-- Fix: add jsonb_typeof check before extracting array elements.
--
-- Fix P1: os_tecnicos_list 'invalid input value for enum user_status_in_empresa: active'
-- The enum values are UPPERCASE ('ACTIVE'), but the SQL used lowercase ('active').

-- 1) Fix create_os_for_current_user__unsafe — INSERT array extraction
create or replace function public.create_os_for_current_user__unsafe(payload jsonb)
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
    equipamento_id,
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
    nullif(payload->>'equipamento_id','')::uuid,
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
    case when payload ? 'anexos' and jsonb_typeof(payload->'anexos') = 'array'
         then array(select jsonb_array_elements_text(payload->'anexos'))
         else null end,
    case when payload ? 'marcadores' and jsonb_typeof(payload->'marcadores') = 'array'
         then array(select jsonb_array_elements_text(payload->'marcadores'))
         else null end,
    nullif(payload->>'ordem','')::int,
    coalesce(nullif(payload->>'custo_estimado','')::numeric, 0),
    coalesce(nullif(payload->>'custo_real','')::numeric, 0)
  )
  returning * into rec;

  perform public.os_recalc_totals(rec.id);
  return rec;
end;
$$;

-- 2) Fix update_os_for_current_user__unsafe — UPDATE array extraction
create or replace function public.update_os_for_current_user__unsafe(p_id uuid, payload jsonb)
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
         equipamento_id        = case when payload ? 'equipamento_id' then nullif(payload->>'equipamento_id','')::uuid else os.equipamento_id end,
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
         anexos                = case when payload ? 'anexos' and jsonb_typeof(payload->'anexos') = 'array'
                                      then array(select jsonb_array_elements_text(payload->'anexos'))
                                      when payload ? 'anexos' then null
                                      else os.anexos end,
         marcadores            = case when payload ? 'marcadores' and jsonb_typeof(payload->'marcadores') = 'array'
                                      then array(select jsonb_array_elements_text(payload->'marcadores'))
                                      when payload ? 'marcadores' then null
                                      else os.marcadores end,
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

-- 3) Fix os_tecnicos_list — enum case mismatch ('active' → 'ACTIVE')
drop function if exists public.os_tecnicos_list(text, int);
create or replace function public.os_tecnicos_list(
  p_q text default null,
  p_limit int default 50
)
returns table(
  user_id uuid,
  email text,
  nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  return query
  select
    eu.user_id,
    u.email::text,
    coalesce(nullif((u.raw_user_meta_data->>'name')::text, ''), u.email::text) as nome
  from public.empresa_usuarios eu
  join auth.users u on u.id = eu.user_id
  where eu.empresa_id = v_emp
    and eu.status = 'ACTIVE'
    and (
      p_q is null
      or u.email::text ilike '%' || p_q || '%'
      or (u.raw_user_meta_data->>'name')::text ilike '%' || p_q || '%'
    )
  order by nome asc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

revoke all on function public.os_tecnicos_list(text, int) from public, anon;
grant execute on function public.os_tecnicos_list(text, int) to authenticated, service_role;

-- 4) Fix os_set_tecnico_for_current_user — same enum case mismatch
create or replace function public.os_set_tecnico_for_current_user(
  p_os_id uuid,
  p_tecnico_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_nome text;
  v_email text;
  v_exists int;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  if v_emp is null then
    raise exception '[RPC][OS][TECNICO] empresa_id inválido' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.ordem_servicos os where os.id = p_os_id and os.empresa_id = v_emp
  ) then
    raise exception '[RPC][OS][TECNICO] OS não encontrada' using errcode = 'P0002';
  end if;

  if p_tecnico_user_id is not null then
    select count(*) into v_exists
    from public.empresa_usuarios eu
    where eu.empresa_id = v_emp and eu.user_id = p_tecnico_user_id and eu.status = 'ACTIVE';

    if coalesce(v_exists, 0) = 0 then
      raise exception '[RPC][OS][TECNICO] técnico não pertence à empresa' using errcode = '42501';
    end if;

    select u.email::text,
           coalesce(nullif((u.raw_user_meta_data->>'name')::text, ''), u.email::text)
    into v_email, v_nome
    from auth.users u where u.id = p_tecnico_user_id;
  end if;

  update public.ordem_servicos
  set tecnico_user_id = p_tecnico_user_id,
      tecnico = v_nome,
      updated_at = now()
  where id = p_os_id and empresa_id = v_emp;
end;
$$;

revoke all on function public.os_set_tecnico_for_current_user(uuid, uuid) from public, anon;
grant execute on function public.os_set_tecnico_for_current_user(uuid, uuid) to authenticated, service_role;
