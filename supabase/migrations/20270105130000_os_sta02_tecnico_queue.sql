/*
  OS-STA-02: Atribuição por técnico + fila por técnico + suporte a mobile/tablet (via UI).

  Motivação:
  - Hoje a OS tem apenas `tecnico` (texto). Para operar assistência técnica, precisamos
    atribuir OS a um usuário real, filtrar “minhas OS” e evitar divergências via console.

  Impacto:
  - Adiciona `tecnico_user_id` em `public.ordem_servicos`.
  - Cria RPCs:
    - `os_tecnicos_list` (lista usuários da empresa para atribuição)
    - `os_set_tecnico_for_current_user` (atribuir/desatribuir técnico)
    - `list_os_for_current_user_v2` (lista OS com filtro por técnico e retorno do nome)

  Reversibilidade:
  - É reversível removendo a coluna e funções, porém isso pode quebrar UI/fluxos.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Schema: coluna + índice
-- -----------------------------------------------------------------------------
alter table public.ordem_servicos
  add column if not exists tecnico_user_id uuid;

create index if not exists idx_os_empresa_tecnico_status_created
  on public.ordem_servicos (empresa_id, tecnico_user_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) RPC: listar técnicos elegíveis (usuários da empresa)
-- -----------------------------------------------------------------------------
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
    and eu.status = 'active'
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

-- -----------------------------------------------------------------------------
-- 3) RPC: atribuir/desatribuir técnico
-- -----------------------------------------------------------------------------
drop function if exists public.os_set_tecnico_for_current_user(uuid, uuid);
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

  -- valida OS na empresa
  if not exists (
    select 1 from public.ordem_servicos os where os.id = p_os_id and os.empresa_id = v_emp
  ) then
    raise exception '[RPC][OS][TECNICO] OS não encontrada' using errcode = 'P0002';
  end if;

  if p_tecnico_user_id is not null then
    select count(*) into v_exists
    from public.empresa_usuarios eu
    where eu.empresa_id = v_emp and eu.user_id = p_tecnico_user_id and eu.status = 'active';

    if coalesce(v_exists, 0) = 0 then
      raise exception '[RPC][OS][TECNICO] técnico não pertence à empresa' using errcode = '42501';
    end if;

    select u.email::text,
           coalesce(nullif((u.raw_user_meta_data->>'name')::text, ''), u.email::text)
      into v_email, v_nome
    from auth.users u
    where u.id = p_tecnico_user_id;
  end if;

  update public.ordem_servicos os
  set
    tecnico_user_id = p_tecnico_user_id,
    tecnico = case
      when p_tecnico_user_id is null then null
      else v_nome
    end,
    updated_at = now()
  where os.id = p_os_id and os.empresa_id = v_emp;
end;
$$;

revoke all on function public.os_set_tecnico_for_current_user(uuid, uuid) from public, anon;
grant execute on function public.os_set_tecnico_for_current_user(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: listagem v2 com filtro de técnico e retorno do nome
-- -----------------------------------------------------------------------------
drop function if exists public.list_os_for_current_user_v2(text, public.status_os[], integer, integer, text, text, uuid, boolean);
create or replace function public.list_os_for_current_user_v2(
  p_search text default null,
  p_status public.status_os[] default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order_by text default 'ordem',
  p_order_dir text default 'asc',
  p_tecnico_user_id uuid default null,
  p_only_mine boolean default false
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
  cliente_nome text,
  tecnico_user_id uuid,
  tecnico_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_order_by text := lower(coalesce(p_order_by, 'ordem'));
  v_order_dir text := case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end;
  v_order_col text;
  v_sql text;
  v_target_user uuid := case when coalesce(p_only_mine, false) then auth.uid() else p_tecnico_user_id end;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','view');

  if v_empresa_id is null then
    raise exception '[RPC][LIST_OS_V2] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  v_order_col := case
    when v_order_by in ('ordem','numero','descricao','status','data_prevista','created_at','updated_at') then v_order_by
    else 'ordem'
  end;

  v_sql := format($fmt$
    select
      os.id, os.empresa_id, os.numero, os.cliente_id, os.descricao, os.status,
      os.data_inicio, os.data_prevista, os.hora,
      os.total_itens, os.desconto_valor, os.total_geral,
      os.forma_recebimento, os.condicao_pagamento,
      os.observacoes, os.observacoes_internas,
      os.created_at, os.updated_at,
      os.ordem,
      p.nome as cliente_nome,
      os.tecnico_user_id,
      coalesce(nullif((u.raw_user_meta_data->>'name')::text, ''), u.email::text) as tecnico_nome
    from public.ordem_servicos os
    left join public.pessoas p
      on p.id = os.cliente_id
     and p.empresa_id = os.empresa_id
    left join auth.users u on u.id = os.tecnico_user_id
    where os.empresa_id = $1
      %s
      %s
      %s
    order by %I %s nulls last, os.numero desc
    limit $2 offset $3
  $fmt$,
    case
      when p_search is null or btrim(p_search) = '' then ''
      else 'and (os.descricao ilike ''%''||$4||''%'' or p.nome ilike ''%''||$4||''%'' or os.numero::text ilike ''%''||$4||''%'')'
    end,
    case
      when p_status is null or array_length(p_status,1) is null then ''
      else 'and os.status = any($5)'
    end,
    case
      when v_target_user is null then ''
      else 'and os.tecnico_user_id = $6'
    end,
    v_order_col,
    v_order_dir
  );

  if (p_status is null or array_length(p_status,1) is null) and v_target_user is null then
    return query execute v_sql using v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search;
  elsif (p_status is null or array_length(p_status,1) is null) and v_target_user is not null then
    return query execute v_sql using v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search, p_status, v_target_user;
  elsif (p_status is not null and array_length(p_status,1) is not null) and v_target_user is null then
    return query execute v_sql using v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search, p_status;
  else
    return query execute v_sql using v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search, p_status, v_target_user;
  end if;
end;
$$;

revoke all on function public.list_os_for_current_user_v2(text, public.status_os[], integer, integer, text, text, uuid, boolean) from public, anon;
grant execute on function public.list_os_for_current_user_v2(text, public.status_os[], integer, integer, text, text, uuid, boolean) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;
