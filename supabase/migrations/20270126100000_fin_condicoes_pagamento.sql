/*
  Financeiro: Condições de Pagamento (prazos/parcelas)

  Objetivo:
  - Padronizar termos como "21 dias", "30 dias", "30/60", "30/60/90".
  - Separar "Condição de Pagamento" (prazo/parcelas) de "Meio de Pagamento" (Pix/Boleto/etc).
  - Multi-tenant com RLS (empresa_id) e RPC-first.
*/

begin;

-- -----------------------------------------------------------------------------
-- 0) Tipos auxiliares (idempotentes)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'financeiro_condicao_pagamento_tipo') then
    create type public.financeiro_condicao_pagamento_tipo as enum ('pagar', 'receber', 'ambos');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Tabela
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_condicoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  tipo public.financeiro_condicao_pagamento_tipo not null default 'ambos',
  nome text not null,
  condicao text not null,
  ativo boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint financeiro_condicoes_pagamento_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade
);

create unique index if not exists fin_cond_pag_empresa_nome_uk
  on public.financeiro_condicoes_pagamento (empresa_id, lower(nome), tipo);

create unique index if not exists fin_cond_pag_empresa_condicao_uk
  on public.financeiro_condicoes_pagamento (empresa_id, lower(condicao), tipo);

create index if not exists idx_fin_cond_pag_empresa_tipo_ativo
  on public.financeiro_condicoes_pagamento (empresa_id, tipo, ativo);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_financeiro_condicoes_pagamento'
      and tgrelid = 'public.financeiro_condicoes_pagamento'::regclass
  ) then
    create trigger handle_updated_at_financeiro_condicoes_pagamento
      before update on public.financeiro_condicoes_pagamento
      for each row execute procedure public.tg_set_updated_at();
  end if;
end $$;

alter table public.financeiro_condicoes_pagamento enable row level security;

drop policy if exists fin_cond_pag_select on public.financeiro_condicoes_pagamento;
drop policy if exists fin_cond_pag_insert on public.financeiro_condicoes_pagamento;
drop policy if exists fin_cond_pag_update on public.financeiro_condicoes_pagamento;
drop policy if exists fin_cond_pag_delete on public.financeiro_condicoes_pagamento;

create policy fin_cond_pag_select on public.financeiro_condicoes_pagamento
  for select using (empresa_id = public.current_empresa_id());
create policy fin_cond_pag_insert on public.financeiro_condicoes_pagamento
  for insert with check (empresa_id = public.current_empresa_id());
create policy fin_cond_pag_update on public.financeiro_condicoes_pagamento
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy fin_cond_pag_delete on public.financeiro_condicoes_pagamento
  for delete using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- 2) Seed (defaults) por empresa + trigger em empresas
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_condicoes_pagamento_seed(uuid);
create or replace function public.financeiro_condicoes_pagamento_seed(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := p_empresa_id;
begin
  if v_empresa is null then
    return;
  end if;

  insert into public.financeiro_condicoes_pagamento (empresa_id, tipo, nome, condicao, ativo, is_system)
  values
    (v_empresa, 'ambos', 'À vista', '0', true, true),
    (v_empresa, 'ambos', '7 dias', '7', true, true),
    (v_empresa, 'ambos', '15 dias', '15', true, true),
    (v_empresa, 'ambos', '21 dias', '21', true, true),
    (v_empresa, 'ambos', '30 dias', '30', true, true),
    (v_empresa, 'ambos', '30/60', '30/60', true, true),
    (v_empresa, 'ambos', '30/60/90', '30/60/90', true, true)
  on conflict (empresa_id, lower(condicao), tipo) do nothing;
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_seed(uuid) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_seed(uuid) to authenticated, service_role;

do $$
declare
  r record;
begin
  if to_regclass('public.empresas') is null then
    return;
  end if;

  for r in select id from public.empresas loop
    perform public.financeiro_condicoes_pagamento_seed(r.id);
  end loop;
end $$;

drop function if exists public.tg_fin_condicoes_pagamento_seed();
create or replace function public.tg_fin_condicoes_pagamento_seed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.financeiro_condicoes_pagamento_seed(new.id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.empresas') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'tg_empresas_fin_cond_pag_seed'
      and tgrelid = 'public.empresas'::regclass
  ) then
    create trigger tg_empresas_fin_cond_pag_seed
      after insert on public.empresas
      for each row
      execute procedure public.tg_fin_condicoes_pagamento_seed();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) RPCs: search + upsert + list (admin)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_condicoes_pagamento_search(public.financeiro_condicao_pagamento_tipo, text, int);
create or replace function public.financeiro_condicoes_pagamento_search(
  p_tipo public.financeiro_condicao_pagamento_tipo,
  p_q text,
  p_limit int default 20
)
returns table(
  id uuid,
  nome text,
  condicao text,
  tipo public.financeiro_condicao_pagamento_tipo
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if not (public.has_permission_for_current_user('contas_a_pagar','view') or public.has_permission_for_current_user('contas_a_receber','view')) then
    raise exception '[FIN][COND_PAG] Sem permissão para listar.' using errcode='42501';
  end if;

  return query
  select c.id, c.nome, c.condicao, c.tipo
  from public.financeiro_condicoes_pagamento c
  where c.empresa_id = v_empresa
    and c.ativo = true
    and (c.tipo = p_tipo or c.tipo = 'ambos' or p_tipo = 'ambos')
    and (
      p_q is null
      or length(trim(p_q)) < 2
      or c.nome ilike '%'||trim(p_q)||'%'
      or c.condicao ilike '%'||trim(p_q)||'%'
    )
  order by c.is_system desc, c.nome asc
  limit greatest(1, least(p_limit, 50));
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_search(public.financeiro_condicao_pagamento_tipo, text, int) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_search(public.financeiro_condicao_pagamento_tipo, text, int) to authenticated, service_role;

drop function if exists public.financeiro_condicoes_pagamento_upsert(jsonb);
create or replace function public.financeiro_condicoes_pagamento_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_tipo public.financeiro_condicao_pagamento_tipo := coalesce(nullif(p_payload->>'tipo','')::public.financeiro_condicao_pagamento_tipo, 'ambos');
  v_nome text := btrim(coalesce(nullif(p_payload->>'nome',''), ''));
  v_condicao text := btrim(coalesce(nullif(p_payload->>'condicao',''), ''));
  v_ativo boolean := coalesce((p_payload->>'ativo')::boolean, true);
  v_is_system boolean := false;
  v_res jsonb;
begin
  if not (public.has_permission_for_current_user('contas_a_pagar','update') or public.has_permission_for_current_user('contas_a_receber','update')) then
    raise exception '[FIN][COND_PAG] Sem permissão para salvar.' using errcode='42501';
  end if;

  if v_nome = '' then
    raise exception '[FIN][COND_PAG] nome é obrigatório.' using errcode='P0001';
  end if;
  if v_condicao = '' then
    raise exception '[FIN][COND_PAG] condição é obrigatória.' using errcode='P0001';
  end if;

  if v_id is not null then
    select c.is_system into v_is_system
    from public.financeiro_condicoes_pagamento c
    where c.id = v_id and c.empresa_id = v_empresa;

    if coalesce(v_is_system,false) then
      raise exception '[FIN][COND_PAG] Itens padrão não podem ser editados.' using errcode='P0001';
    end if;

    update public.financeiro_condicoes_pagamento c
      set nome = v_nome,
          condicao = v_condicao,
          tipo = v_tipo,
          ativo = v_ativo
    where c.id = v_id and c.empresa_id = v_empresa
    returning to_jsonb(c.*) into v_res;
  else
    insert into public.financeiro_condicoes_pagamento (empresa_id, tipo, nome, condicao, ativo, is_system)
    values (v_empresa, v_tipo, v_nome, v_condicao, v_ativo, false)
    returning to_jsonb(financeiro_condicoes_pagamento.*) into v_res;
  end if;

  if v_res is null then
    raise exception '[FIN][COND_PAG] Registro não encontrado.' using errcode='P0002';
  end if;

  return v_res;
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_upsert(jsonb) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_upsert(jsonb) to authenticated, service_role;

drop function if exists public.financeiro_condicoes_pagamento_list(public.financeiro_condicao_pagamento_tipo, text, text, int);
create or replace function public.financeiro_condicoes_pagamento_list(
  p_tipo public.financeiro_condicao_pagamento_tipo,
  p_q text,
  p_status text default 'all',
  p_limit int default 200
)
returns table(
  id uuid,
  tipo public.financeiro_condicao_pagamento_tipo,
  nome text,
  condicao text,
  ativo boolean,
  is_system boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := greatest(1, least(p_limit, 500));
begin
  if not (public.has_permission_for_current_user('contas_a_pagar','view') or public.has_permission_for_current_user('contas_a_receber','view')) then
    raise exception '[FIN][COND_PAG] Sem permissão para listar.' using errcode='42501';
  end if;

  return query
  select c.id, c.tipo, c.nome, c.condicao, c.ativo, c.is_system, c.created_at, c.updated_at
  from public.financeiro_condicoes_pagamento c
  where c.empresa_id = v_empresa
    and (c.tipo = p_tipo or c.tipo = 'ambos' or p_tipo = 'ambos')
    and (
      p_status = 'all'
      or (p_status = 'ativo' and c.ativo = true)
      or (p_status = 'inativo' and c.ativo = false)
    )
    and (
      p_q is null
      or length(trim(p_q)) < 2
      or c.nome ilike '%'||trim(p_q)||'%'
      or c.condicao ilike '%'||trim(p_q)||'%'
    )
  order by c.is_system desc, c.nome asc
  limit v_limit;
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_list(public.financeiro_condicao_pagamento_tipo, text, text, int) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_list(public.financeiro_condicao_pagamento_tipo, text, text, int) to authenticated, service_role;

drop function if exists public.financeiro_condicoes_pagamento_set_ativo(uuid, public.financeiro_condicao_pagamento_tipo, boolean);
create or replace function public.financeiro_condicoes_pagamento_set_ativo(
  p_id uuid,
  p_tipo public.financeiro_condicao_pagamento_tipo,
  p_ativo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_is_system boolean := false;
  v_res jsonb;
begin
  if not (public.has_permission_for_current_user('contas_a_pagar','update') or public.has_permission_for_current_user('contas_a_receber','update')) then
    raise exception '[FIN][COND_PAG] Sem permissão para atualizar.' using errcode='42501';
  end if;

  select c.is_system into v_is_system
  from public.financeiro_condicoes_pagamento c
  where c.id = p_id and c.empresa_id = v_empresa;

  if coalesce(v_is_system,false) then
    raise exception '[FIN][COND_PAG] Itens padrão não podem ser inativados.' using errcode='P0001';
  end if;

  update public.financeiro_condicoes_pagamento c
    set ativo = p_ativo
  where c.id = p_id
    and c.empresa_id = v_empresa
    and (c.tipo = p_tipo or p_tipo = 'ambos' or c.tipo = 'ambos')
  returning to_jsonb(c.*) into v_res;

  if v_res is null then
    raise exception '[FIN][COND_PAG] Registro não encontrado.' using errcode='P0002';
  end if;
  return v_res;
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_set_ativo(uuid, public.financeiro_condicao_pagamento_tipo, boolean) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_set_ativo(uuid, public.financeiro_condicao_pagamento_tipo, boolean) to authenticated, service_role;

drop function if exists public.financeiro_condicoes_pagamento_delete(uuid, public.financeiro_condicao_pagamento_tipo);
create or replace function public.financeiro_condicoes_pagamento_delete(
  p_id uuid,
  p_tipo public.financeiro_condicao_pagamento_tipo
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_is_system boolean := false;
  v_res jsonb;
begin
  if not (public.has_permission_for_current_user('contas_a_pagar','delete') or public.has_permission_for_current_user('contas_a_receber','delete')) then
    raise exception '[FIN][COND_PAG] Sem permissão para excluir.' using errcode='42501';
  end if;

  select c.is_system into v_is_system
  from public.financeiro_condicoes_pagamento c
  where c.id = p_id and c.empresa_id = v_empresa;

  if coalesce(v_is_system,false) then
    raise exception '[FIN][COND_PAG] Não é possível excluir itens padrão do sistema.' using errcode='P0001';
  end if;

  delete from public.financeiro_condicoes_pagamento c
  where c.id = p_id
    and c.empresa_id = v_empresa
    and (c.tipo = p_tipo or p_tipo = 'ambos' or c.tipo = 'ambos')
  returning to_jsonb(c.*) into v_res;

  if v_res is null then
    raise exception '[FIN][COND_PAG] Registro não encontrado.' using errcode='P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.financeiro_condicoes_pagamento_delete(uuid, public.financeiro_condicao_pagamento_tipo) from public, anon;
grant execute on function public.financeiro_condicoes_pagamento_delete(uuid, public.financeiro_condicao_pagamento_tipo) to authenticated, service_role;

commit;

