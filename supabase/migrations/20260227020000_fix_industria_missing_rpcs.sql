/*
  Fix: PROD com RPCs de Indústria faltando (404/400 via PostgREST)

  Sintomas em produção:
  - POST /rest/v1/rpc/industria_get_dashboard_stats => 404
  - POST /rest/v1/rpc/industria_materiais_cliente_list => 404
  - POST /rest/v1/rpc/industria_centros_trabalho_list => 400 (schema cache desatualizado pode causar mismatch de params)

  Este arquivo:
  - Garante tabela/policies base para industria_materiais_cliente
  - Recria RPCs: industria_get_dashboard_stats, industria_materiais_cliente_list/get/upsert/delete
  - Gatilho para recarregar schema cache do PostgREST
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Materiais do Cliente: tabela mínima + RLS (idempotente)
-- -----------------------------------------------------------------------------

create table if not exists public.industria_materiais_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  cliente_id uuid not null,
  produto_id uuid not null,
  codigo_cliente text,
  nome_cliente text,
  unidade text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FKs best-effort (evita falhar em ambientes com drift)
do $$
begin
  if to_regclass('public.empresas') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'industria_materiais_cliente_empresa_fkey'
        and conrelid = 'public.industria_materiais_cliente'::regclass
    ) then
      alter table public.industria_materiais_cliente
        add constraint industria_materiais_cliente_empresa_fkey
        foreign key (empresa_id) references public.empresas(id) on delete cascade;
    end if;
  end if;
  if to_regclass('public.pessoas') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'industria_materiais_cliente_cliente_fkey'
        and conrelid = 'public.industria_materiais_cliente'::regclass
    ) then
      alter table public.industria_materiais_cliente
        add constraint industria_materiais_cliente_cliente_fkey
        foreign key (cliente_id) references public.pessoas(id);
    end if;
  end if;
  if to_regclass('public.produtos') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'industria_materiais_cliente_produto_fkey'
        and conrelid = 'public.industria_materiais_cliente'::regclass
    ) then
      alter table public.industria_materiais_cliente
        add constraint industria_materiais_cliente_produto_fkey
        foreign key (produto_id) references public.produtos(id);
    end if;
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_industria_materiais_cliente'
      and tgrelid = 'public.industria_materiais_cliente'::regclass
  ) then
    create trigger handle_updated_at_industria_materiais_cliente
      before update on public.industria_materiais_cliente
      for each row execute procedure public.tg_set_updated_at();
  end if;
end $$;

alter table public.industria_materiais_cliente enable row level security;

drop policy if exists "ind_matcli_select" on public.industria_materiais_cliente;
drop policy if exists "ind_matcli_insert" on public.industria_materiais_cliente;
drop policy if exists "ind_matcli_update" on public.industria_materiais_cliente;
drop policy if exists "ind_matcli_delete" on public.industria_materiais_cliente;

create policy "ind_matcli_select"
  on public.industria_materiais_cliente
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_matcli_insert"
  on public.industria_materiais_cliente
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_matcli_update"
  on public.industria_materiais_cliente
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_matcli_delete"
  on public.industria_materiais_cliente
  for delete
  using (empresa_id = public.current_empresa_id());

-- Índices auxiliares (não assume modelo de unicidade específico)
create index if not exists idx_ind_matcli_empresa on public.industria_materiais_cliente (empresa_id);
create index if not exists idx_ind_matcli_empresa_cliente on public.industria_materiais_cliente (empresa_id, cliente_id, ativo);
create index if not exists idx_ind_matcli_empresa_produto on public.industria_materiais_cliente (empresa_id, produto_id);

-- -----------------------------------------------------------------------------
-- 2) RPC: Dashboard stats (usa tabela unificada industria_ordens)
-- -----------------------------------------------------------------------------

drop function if exists public.industria_get_dashboard_stats();
create or replace function public.industria_get_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_producao jsonb;
  v_benef jsonb;
  v_total_producao bigint;
  v_total_benef bigint;
begin
  perform public.assert_empresa_role_at_least('member');

  if v_empresa_id is null then
    return jsonb_build_object(
      'producao_status', '[]'::jsonb,
      'beneficiamento_status', '[]'::jsonb,
      'total_producao', 0,
      'total_beneficiamento', 0
    );
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('status', s.status, 'total', s.total) order by s.status),
    '[]'::jsonb
  )
  into v_producao
  from (
    select o.status, count(*)::int as total
    from public.industria_ordens o
    where o.empresa_id = v_empresa_id
      and o.tipo_ordem = 'industrializacao'
    group by o.status
  ) s;

  select coalesce(
    jsonb_agg(jsonb_build_object('status', s.status, 'total', s.total) order by s.status),
    '[]'::jsonb
  )
  into v_benef
  from (
    select o.status, count(*)::int as total
    from public.industria_ordens o
    where o.empresa_id = v_empresa_id
      and o.tipo_ordem = 'beneficiamento'
    group by o.status
  ) s;

  select count(*) into v_total_producao
  from public.industria_ordens o
  where o.empresa_id = v_empresa_id
    and o.tipo_ordem = 'industrializacao';

  select count(*) into v_total_benef
  from public.industria_ordens o
  where o.empresa_id = v_empresa_id
    and o.tipo_ordem = 'beneficiamento';

  return jsonb_build_object(
    'producao_status', v_producao,
    'beneficiamento_status', v_benef,
    'total_producao', coalesce(v_total_producao, 0),
    'total_beneficiamento', coalesce(v_total_benef, 0)
  );
end;
$$;

revoke all on function public.industria_get_dashboard_stats() from public, anon;
grant execute on function public.industria_get_dashboard_stats() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPCs: Materiais do Cliente (padrão CRUD)
-- -----------------------------------------------------------------------------

drop function if exists public.industria_materiais_cliente_list(text, uuid, boolean, int, int);
create or replace function public.industria_materiais_cliente_list(
  p_search text default null,
  p_cliente_id uuid default null,
  p_ativo boolean default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  cliente_id uuid,
  cliente_nome text,
  produto_id uuid,
  produto_nome text,
  codigo_cliente text,
  nome_cliente text,
  unidade text,
  ativo boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  perform public.assert_empresa_role_at_least('member');

  return query
  select
    mc.id,
    mc.cliente_id,
    cli.nome as cliente_nome,
    mc.produto_id,
    pr.nome as produto_nome,
    mc.codigo_cliente,
    mc.nome_cliente,
    mc.unidade,
    mc.ativo,
    count(*) over() as total_count
  from public.industria_materiais_cliente mc
  join public.pessoas cli on cli.id = mc.cliente_id
  join public.produtos pr on pr.id = mc.produto_id
  where mc.empresa_id = v_empresa_id
    and (p_cliente_id is null or mc.cliente_id = p_cliente_id)
    and (p_ativo is null or mc.ativo = p_ativo)
    and (
      p_search is null
      or coalesce(mc.codigo_cliente,'') ilike '%'||p_search||'%'
      or coalesce(mc.nome_cliente,'')   ilike '%'||p_search||'%'
      or coalesce(cli.nome,'')          ilike '%'||p_search||'%'
      or coalesce(pr.nome,'')           ilike '%'||p_search||'%'
    )
  order by
    mc.ativo desc,
    coalesce(mc.nome_cliente, pr.nome) asc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

revoke all on function public.industria_materiais_cliente_list(text, uuid, boolean, int, int) from public, anon;
grant execute on function public.industria_materiais_cliente_list(text, uuid, boolean, int, int) to authenticated, service_role;

drop function if exists public.industria_materiais_cliente_get(uuid);
create or replace function public.industria_materiais_cliente_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_res jsonb;
begin
  perform public.assert_empresa_role_at_least('member');

  select
    to_jsonb(mc.*)
    || jsonb_build_object(
      'cliente_nome', cli.nome,
      'produto_nome', pr.nome
    )
  into v_res
  from public.industria_materiais_cliente mc
  join public.pessoas cli on cli.id = mc.cliente_id
  join public.produtos pr on pr.id = mc.produto_id
  where mc.id = p_id
    and mc.empresa_id = v_empresa_id;

  return v_res;
end;
$$;

revoke all on function public.industria_materiais_cliente_get(uuid) from public, anon;
grant execute on function public.industria_materiais_cliente_get(uuid) to authenticated, service_role;

drop function if exists public.industria_materiais_cliente_upsert(jsonb);
create or replace function public.industria_materiais_cliente_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_cli uuid := nullif(p_payload->>'cliente_id','')::uuid;
  v_prod uuid := nullif(p_payload->>'produto_id','')::uuid;
  v_cod text := nullif(p_payload->>'codigo_cliente','');
  v_res jsonb;
begin
  perform public.assert_empresa_role_at_least('member');

  if v_empresa_id is null then
    raise exception '[IND][MATERIAL_CLIENTE] Nenhuma empresa ativa encontrada.' using errcode='42501';
  end if;
  if v_cli is null then
    raise exception '[IND][MATERIAL_CLIENTE] cliente_id é obrigatório.' using errcode='P0001';
  end if;
  if v_prod is null then
    raise exception '[IND][MATERIAL_CLIENTE] produto_id é obrigatório.' using errcode='P0001';
  end if;

  if v_id is null then
    insert into public.industria_materiais_cliente (
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      nome_cliente,
      unidade,
      ativo,
      observacoes
    ) values (
      v_empresa_id,
      v_cli,
      v_prod,
      v_cod,
      nullif(p_payload->>'nome_cliente',''),
      nullif(p_payload->>'unidade',''),
      coalesce((p_payload->>'ativo')::boolean, true),
      nullif(p_payload->>'observacoes','')
    )
    returning id into v_id;
  else
    update public.industria_materiais_cliente
       set cliente_id     = v_cli,
           produto_id     = v_prod,
           codigo_cliente = v_cod,
           nome_cliente   = nullif(p_payload->>'nome_cliente',''),
           unidade        = nullif(p_payload->>'unidade',''),
           ativo          = coalesce((p_payload->>'ativo')::boolean, ativo),
           observacoes    = nullif(p_payload->>'observacoes',''),
           updated_at     = now()
     where id = v_id
       and empresa_id = v_empresa_id
     returning id into v_id;

    if v_id is null then
      raise exception '[IND][MATERIAL_CLIENTE] Registro não encontrado ou acesso negado.' using errcode='P0002';
    end if;
  end if;

  select public.industria_materiais_cliente_get(v_id) into v_res;
  return v_res;
end;
$$;

revoke all on function public.industria_materiais_cliente_upsert(jsonb) from public, anon;
grant execute on function public.industria_materiais_cliente_upsert(jsonb) to authenticated, service_role;

drop function if exists public.industria_materiais_cliente_delete(uuid);
create or replace function public.industria_materiais_cliente_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  perform public.assert_empresa_role_at_least('member');

  delete from public.industria_materiais_cliente
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception '[IND][MATERIAL_CLIENTE] Registro não encontrado.' using errcode='P0002';
  end if;
end;
$$;

revoke all on function public.industria_materiais_cliente_delete(uuid) from public, anon;
grant execute on function public.industria_materiais_cliente_delete(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Força reload do schema cache do PostgREST
-- -----------------------------------------------------------------------------
select pg_notify('pgrst','reload schema');

commit;

