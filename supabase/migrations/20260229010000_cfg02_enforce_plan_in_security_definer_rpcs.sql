/*
  CFG-02: Enforcement em 3 camadas (Menu + Rotas + RPC/DB)

  Já existe enforcement por RLS (policies RESTRICTIVE) via `plano_mvp_allows(...)`,
  porém RPCs `SECURITY DEFINER` podem burlar RLS dependendo do owner/role.

  Este patch adiciona checagem explícita de plano nos RPCs críticos de:
  - Serviços/OS  (feature = 'servicos')
  - Indústria    (feature = 'industria') via helper central usado pelos wrappers industriais
*/

BEGIN;

-- Helper: falha cedo quando o plano não permite o módulo (anti-bypass via console/PostgREST).
create or replace function public.require_plano_mvp_allows(p_feature text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''));
begin
  -- service_role sempre pode (jobs/automação)
  if v_role = 'service_role' then
    return;
  end if;

  if not public.plano_mvp_allows(p_feature) then
    raise exception using
      errcode = '42501',
      message = format('Recurso indisponível no plano atual (%s).', coalesce(p_feature, ''));
  end if;
end;
$$;

revoke all on function public.require_plano_mvp_allows(text) from public, anon;
grant execute on function public.require_plano_mvp_allows(text) to authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- Serviços: RPCs SECURITY DEFINER (add require_plano_mvp_allows('servicos'))
-- -----------------------------------------------------------------------------

create or replace function public.create_service_for_current_user(payload jsonb)
returns public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CREATE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  perform public.require_plano_mvp_allows('servicos');

  insert into public.servicos (
    empresa_id, descricao, codigo, preco_venda, unidade, status,
    codigo_servico, nbs, nbs_ibpt_required,
    descricao_complementar, observacoes
  )
  values (
    v_empresa_id,
    payload->>'descricao',
    nullif(payload->>'codigo',''),
    nullif(payload->>'preco_venda','')::numeric,
    payload->>'unidade',
    coalesce(nullif(payload->>'status','')::public.status_servico, 'ativo'),
    payload->>'codigo_servico',
    payload->>'nbs',
    coalesce(nullif(payload->>'nbs_ibpt_required','')::boolean, false),
    payload->>'descricao_complementar',
    payload->>'observacoes'
  )
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.create_service_for_current_user(jsonb) from public;
grant execute on function public.create_service_for_current_user(jsonb) to authenticated, service_role;

create or replace function public.update_service_for_current_user(p_id uuid, payload jsonb)
returns public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][UPDATE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  perform public.require_plano_mvp_allows('servicos');

  update public.servicos s
     set descricao              = coalesce(nullif(payload->>'descricao',''), s.descricao),
         codigo                 = case when payload ? 'codigo' then nullif(payload->>'codigo','') else s.codigo end,
         preco_venda            = coalesce(nullif(payload->>'preco_venda','')::numeric, s.preco_venda),
         unidade                = coalesce(nullif(payload->>'unidade',''), s.unidade),
         status                 = coalesce(nullif(payload->>'status','')::public.status_servico, s.status),
         codigo_servico         = coalesce(nullif(payload->>'codigo_servico',''), s.codigo_servico),
         nbs                    = coalesce(nullif(payload->>'nbs',''), s.nbs),
         nbs_ibpt_required      = coalesce(nullif(payload->>'nbs_ibpt_required','')::boolean, s.nbs_ibpt_required),
         descricao_complementar = coalesce(nullif(payload->>'descricao_complementar',''), s.descricao_complementar),
         observacoes            = coalesce(nullif(payload->>'observacoes',''), s.observacoes)
   where s.id = p_id
     and s.empresa_id = v_empresa_id
  returning * into rec;

  if not found then
    raise exception '[RPC][UPDATE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;

  return rec;
end;
$$;

revoke all on function public.update_service_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_service_for_current_user(uuid, jsonb) to authenticated, service_role;

create or replace function public.delete_service_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if v_empresa_id is null then
    raise exception '[RPC][DELETE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  perform public.require_plano_mvp_allows('servicos');

  delete from public.servicos s
  where s.id = p_id
    and s.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][DELETE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;
end;
$$;

revoke all on function public.delete_service_for_current_user(uuid) from public;
grant execute on function public.delete_service_for_current_user(uuid) to authenticated, service_role;

create or replace function public.get_service_by_id_for_current_user(p_id uuid)
returns public.servicos
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select s.*
  from public.servicos s
  where s.id = p_id
    and s.empresa_id = public.current_empresa_id()
    and public.plano_mvp_allows('servicos')
  limit 1
$$;

revoke all on function public.get_service_by_id_for_current_user(uuid) from public;
grant execute on function public.get_service_by_id_for_current_user(uuid) to authenticated, service_role;

create or replace function public.list_services_for_current_user_v2(
  p_search text default null,
  p_status public.status_servico default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_order_by text default 'descricao',
  p_order_dir text default 'asc'
)
returns setof public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_sql text;
  v_order_by text := lower(coalesce(p_order_by, 'descricao'));
  v_order_dir text := case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end;
  v_order_col text;
begin
  if v_empresa_id is null then
    raise exception '[RPC][LIST_SERVICES_V2] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  perform public.require_plano_mvp_allows('servicos');

  v_order_col := case
    when v_order_by in ('descricao','codigo','preco_venda','unidade','status','created_at','updated_at') then v_order_by
    else 'descricao'
  end;

  v_sql := format($q$
    select *
    from public.servicos
    where empresa_id = $1
      %s
      %s
    order by %I %s
    limit $2 offset $3
  $q$,
    case
      when p_search is null or btrim(p_search) = '' then ''
      else 'and (descricao ilike ''%''||$4||''%'' or coalesce(codigo, '''') ilike ''%''||$4||''%'' or coalesce(codigo_servico, '''') ilike ''%''||$4||''%'' or coalesce(nbs, '''') ilike ''%''||$4||''%'')'
    end,
    case
      when p_status is null then ''
      else 'and status = $5'
    end,
    v_order_col,
    v_order_dir
  );

  return query execute v_sql using
    v_empresa_id, greatest(p_limit, 0), greatest(p_offset, 0),
    case when p_search is null then null else p_search end,
    p_status;
end;
$$;

revoke all on function public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text) from public;
grant execute on function public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text) to authenticated, service_role;

create or replace function public.count_services_for_current_user(
  p_search text default null,
  p_status public.status_servico default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_plano_mvp_allows('servicos');
  return (
    select count(*)
    from public.servicos s
    where s.empresa_id = public.current_empresa_id()
      and (
        p_search is null or btrim(p_search) = ''
        or s.descricao ilike '%' || p_search || '%'
        or coalesce(s.codigo, '') ilike '%' || p_search || '%'
        or coalesce(s.codigo_servico, '') ilike '%' || p_search || '%'
        or coalesce(s.nbs, '') ilike '%' || p_search || '%'
      )
      and (
        p_status is null or s.status = p_status
      )
  );
end;
$$;

revoke all on function public.count_services_for_current_user(text, public.status_servico) from public;
grant execute on function public.count_services_for_current_user(text, public.status_servico) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OS: wrappers RBAC (add require_plano_mvp_allows('servicos'))
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text)') is not null then
    execute $sql$
      create or replace function public.list_os_for_current_user(
        p_search text default null,
        p_status public.status_os[] default null,
        p_limit integer default 50,
        p_offset integer default 0,
        p_order_by text default 'ordem',
        p_order_dir text default 'asc'
      )
      returns table(
        id uuid,
        empresa_id uuid,
        numero bigint,
        cliente_id uuid,
        descricao text,
        status public.status_os,
        data_inicio date,
        data_prevista date,
        hora time,
        total_itens numeric,
        desconto_valor numeric,
        total_geral numeric,
        forma_recebimento text,
        condicao_pagamento text,
        observacoes text,
        observacoes_internas text,
        created_at timestamptz,
        updated_at timestamptz,
        ordem integer,
        cliente_nome text
      )
      language plpgsql
      security definer
      set search_path = pg_catalog, public
      as $body$
      begin
        perform public.require_plano_mvp_allows('servicos');
        perform public.require_permission_for_current_user('os','view');
        return query select * from public.list_os_for_current_user__unsafe(p_search, p_status, p_limit, p_offset, p_order_by, p_order_dir);
      end;
      $body$;
    $sql$;
  end if;

  if to_regprocedure('public.os_set_status_for_current_user(uuid, public.status_os, jsonb)') is not null then
    execute $sql$
      create or replace function public.os_set_status_for_current_user(
        p_os_id uuid,
        p_next public.status_os,
        p_opts jsonb default '{}'::jsonb
      )
      returns public.ordem_servicos
      language plpgsql
      security definer
      set search_path = pg_catalog, public
      as $body$
      begin
        perform public.require_plano_mvp_allows('servicos');
        perform public.require_permission_for_current_user('os','update');
        return public.os_set_status_for_current_user__unsafe(p_os_id, p_next, p_opts);
      end;
      $body$;
    $sql$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Indústria: aplica enforcement de plano dentro do helper central (anti-bypass)
-- -----------------------------------------------------------------------------

create or replace function public.assert_empresa_role_at_least(p_min_role text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_have int;
  v_need int;
  v_jwt_role text := coalesce(nullif(auth.role(), ''), nullif(current_setting('request.jwt.claim.role', true), ''));
begin
  if v_jwt_role = 'service_role' then
    return;
  end if;

  -- CFG-02: módulo Indústria só roda se o plano permitir
  perform public.require_plano_mvp_allows('industria');

  v_role := public.current_empresa_role();
  v_have := public.empresa_role_rank(v_role);
  v_need := public.empresa_role_rank(p_min_role);

  if v_need <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Configuração inválida de permissão (role mínima).';
  end if;

  if v_have < v_need then
    raise exception using
      errcode = '42501',
      message = format('Sem permissão para executar esta ação (necessário: %s).', p_min_role);
  end if;
end;
$$;

revoke all on function public.assert_empresa_role_at_least(text) from public, anon;
grant execute on function public.assert_empresa_role_at_least(text) to authenticated, service_role, postgres;

select pg_notify('pgrst', 'reload schema');

COMMIT;

