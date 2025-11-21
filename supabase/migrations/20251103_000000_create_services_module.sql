-- 20251103_000000_create_services_module.sql
-- Módulo: SERVIÇOS (multi-tenant, RLS por operação, RPCs seguras)
-- Logs temporários: [RPC] [CREATE_*] [AUTH]

-- =========================================
-- Tipos (idempotente)
-- =========================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_servico') then
    create type public.status_servico as enum ('ativo', 'inativo');
  end if;
end$$;

-- =========================================
-- Tabela
-- =========================================
create table if not exists public.servicos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  descricao           text not null,                          -- "Descrição completa do serviço"
  codigo              text,                                   -- "Código ou referência (opcional)"
  preco_venda         numeric(12,2),                          -- R$
  unidade             text,                                   -- Ex.: 'UN', 'H', etc.
  status              public.status_servico not null default 'ativo',

  codigo_servico      text,                                   -- "Código do serviço conforme tabela de serviços"
  nbs                 text,                                   -- "Nomenclatura brasileira de serviço (NBS)"
  nbs_ibpt_required   boolean default false,                  -- “Necessária para o IBPT”

  descricao_complementar text,                               -- rich text (HTML/plain)
  observacoes           text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =========================================
-- Trigger updated_at (idempotente)
-- =========================================
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'tg_set_updated_at' and pronamespace = 'public'::regnamespace
  ) then
    create or replace function public.tg_set_updated_at()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
    as $fn$
    begin
      new.updated_at := now();
      return new;
    end;
    $fn$;
  end if;
end$$;

drop trigger if exists tg_servicos_set_updated_at on public.servicos;
create trigger tg_servicos_set_updated_at
before update on public.servicos
for each row execute function public.tg_set_updated_at();

-- =========================================
-- Índices
-- =========================================
create index if not exists idx_servicos_empresa on public.servicos(empresa_id);
create index if not exists idx_servicos_empresa_descricao on public.servicos(empresa_id, descricao);
-- código único por empresa (apenas quando não nulo)
create unique index if not exists uq_servicos_empresa_codigo
  on public.servicos(empresa_id, codigo)
  where codigo is not null;

-- =========================================
-- RLS por operação
-- =========================================
alter table public.servicos enable row level security;

-- SELECT
drop policy if exists sel_servicos_by_empresa on public.servicos;
create policy sel_servicos_by_empresa
  on public.servicos
  for select
  using (empresa_id = public.current_empresa_id());

-- INSERT
drop policy if exists ins_servicos_same_empresa on public.servicos;
create policy ins_servicos_same_empresa
  on public.servicos
  for insert
  with check (empresa_id = public.current_empresa_id());

-- UPDATE
drop policy if exists upd_servicos_same_empresa on public.servicos;
create policy upd_servicos_same_empresa
  on public.servicos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

-- DELETE
drop policy if exists del_servicos_same_empresa on public.servicos;
create policy del_servicos_same_empresa
  on public.servicos
  for delete
  using (empresa_id = public.current_empresa_id());

-- =========================================
-- RPCs seguras (SECURITY DEFINER) com search_path fixo
-- =========================================

-- CREATE
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

  perform pg_notify('app_log', '[RPC] [CREATE_SERVICE] ' || rec.id::text);
  return rec;
end;
$$;

revoke all on function public.create_service_for_current_user(jsonb) from public;
grant execute on function public.create_service_for_current_user(jsonb) to authenticated;
grant execute on function public.create_service_for_current_user(jsonb) to service_role;

-- UPDATE
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

  update public.servicos s
     set descricao            = coalesce(nullif(payload->>'descricao',''), s.descricao),
         codigo               = case when payload ? 'codigo'
                                     then nullif(payload->>'codigo','')
                                     else s.codigo end,
         preco_venda          = coalesce(nullif(payload->>'preco_venda','')::numeric, s.preco_venda),
         unidade              = coalesce(nullif(payload->>'unidade',''), s.unidade),
         status               = coalesce(nullif(payload->>'status','')::public.status_servico, s.status),
         codigo_servico       = coalesce(nullif(payload->>'codigo_servico',''), s.codigo_servico),
         nbs                  = coalesce(nullif(payload->>'nbs',''), s.nbs),
         nbs_ibpt_required    = coalesce(nullif(payload->>'nbs_ibpt_required','')::boolean, s.nbs_ibpt_required),
         descricao_complementar = coalesce(nullif(payload->>'descricao_complementar',''), s.descricao_complementar),
         observacoes          = coalesce(nullif(payload->>'observacoes',''), s.observacoes)
   where s.id = p_id
     and s.empresa_id = v_empresa_id
  returning * into rec;

  if not found then
    raise exception '[RPC][UPDATE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;

  perform pg_notify('app_log', '[RPC] [UPDATE_SERVICE] ' || rec.id::text);
  return rec;
end;
$$;

revoke all on function public.update_service_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_service_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.update_service_for_current_user(uuid, jsonb) to service_role;

-- DELETE
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

  delete from public.servicos s
  where s.id = p_id
    and s.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][DELETE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;

  perform pg_notify('app_log', '[RPC] [DELETE_SERVICE] ' || p_id::text);
end;
$$;

revoke all on function public.delete_service_for_current_user(uuid) from public;
grant execute on function public.delete_service_for_current_user(uuid) to authenticated;
grant execute on function public.delete_service_for_current_user(uuid) to service_role;

-- GET by ID
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
  limit 1
$$;

revoke all on function public.get_service_by_id_for_current_user(uuid) from public;
grant execute on function public.get_service_by_id_for_current_user(uuid) to authenticated;
grant execute on function public.get_service_by_id_for_current_user(uuid) to service_role;

-- LIST + busca simples + paginação
create or replace function public.list_services_for_current_user(
  p_search text default null,
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
begin
  if v_empresa_id is null then
    raise exception '[RPC][LIST_SERVICES] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  v_sql := format($q$
    select *
    from public.servicos
    where empresa_id = $1
      %s
    order by %I %s
    limit $2 offset $3
  $q$,
    case when p_search is null or btrim(p_search) = '' then '' else 'and (descricao ilike ''%''||$4||''%'' or coalesce(codigo, '''') ilike ''%''||$4||''%'')' end,
    p_order_by,
    case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end
  );

  return query execute v_sql using
    v_empresa_id, p_limit, p_offset,
    case when p_search is null then null else p_search end;
end;
$$;

revoke all on function public.list_services_for_current_user(text, int, int, text, text) from public;
grant execute on function public.list_services_for_current_user(text, int, int, text, text) to authenticated;
grant execute on function public.list_services_for_current_user(text, int, int, text, text) to service_role;
