/*
  Financeiro: Meios de Pagamento/Recebimento (cadastro central)

  Objetivo:
  - Evitar digitação livre em "Forma de Pagamento" / "Forma de Recebimento".
  - Garantir padronização (Pix, Boleto, Cartão, etc.) por empresa (multi-tenant).
  - Permitir busca/autocomplete e criação controlada (via RPC).
*/

begin;

-- -----------------------------------------------------------------------------
-- 0) Tipos auxiliares (idempotentes)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'financeiro_meio_pagamento_tipo') then
    create type public.financeiro_meio_pagamento_tipo as enum ('pagamento', 'recebimento');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Tabela
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_meios_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  tipo public.financeiro_meio_pagamento_tipo not null,
  nome text not null,
  ativo boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint financeiro_meios_pagamento_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade
);

create unique index if not exists fin_meios_pag_empresa_nome_uk
  on public.financeiro_meios_pagamento (empresa_id, lower(nome), tipo);

create index if not exists idx_fin_meios_pag_empresa_tipo
  on public.financeiro_meios_pagamento (empresa_id, tipo, ativo);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_meios_pagamento'
      and tgrelid = 'public.financeiro_meios_pagamento'::regclass
  ) then
    create trigger handle_updated_at_financeiro_meios_pagamento
      before update on public.financeiro_meios_pagamento
      for each row execute procedure public.tg_set_updated_at();
  end if;
end $$;

alter table public.financeiro_meios_pagamento enable row level security;

drop policy if exists fin_meios_pag_select on public.financeiro_meios_pagamento;
drop policy if exists fin_meios_pag_insert on public.financeiro_meios_pagamento;
drop policy if exists fin_meios_pag_update on public.financeiro_meios_pagamento;
drop policy if exists fin_meios_pag_delete on public.financeiro_meios_pagamento;

create policy fin_meios_pag_select on public.financeiro_meios_pagamento
  for select using (empresa_id = public.current_empresa_id());
create policy fin_meios_pag_insert on public.financeiro_meios_pagamento
  for insert with check (empresa_id = public.current_empresa_id());
create policy fin_meios_pag_update on public.financeiro_meios_pagamento
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy fin_meios_pag_delete on public.financeiro_meios_pagamento
  for delete using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- 2) Seed (defaults) por empresa + trigger em empresas
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_meios_pagamento_seed(uuid);
create or replace function public.financeiro_meios_pagamento_seed(p_empresa_id uuid)
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

  -- Pagamento
  insert into public.financeiro_meios_pagamento (empresa_id, tipo, nome, ativo, is_system)
  values
    (v_empresa, 'pagamento', 'Pix', true, true),
    (v_empresa, 'pagamento', 'Boleto', true, true),
    (v_empresa, 'pagamento', 'Cartão de crédito', true, true),
    (v_empresa, 'pagamento', 'Cartão de débito', true, true),
    (v_empresa, 'pagamento', 'Transferência', true, true),
    (v_empresa, 'pagamento', 'Dinheiro', true, true),
    (v_empresa, 'pagamento', 'Cheque', true, true),
    (v_empresa, 'pagamento', 'TED/DOC', true, true)
  on conflict (empresa_id, lower(nome), tipo) do nothing;

  -- Recebimento
  insert into public.financeiro_meios_pagamento (empresa_id, tipo, nome, ativo, is_system)
  values
    (v_empresa, 'recebimento', 'Pix', true, true),
    (v_empresa, 'recebimento', 'Boleto', true, true),
    (v_empresa, 'recebimento', 'Cartão de crédito', true, true),
    (v_empresa, 'recebimento', 'Cartão de débito', true, true),
    (v_empresa, 'recebimento', 'Transferência', true, true),
    (v_empresa, 'recebimento', 'Dinheiro', true, true),
    (v_empresa, 'recebimento', 'Cheque', true, true),
    (v_empresa, 'recebimento', 'TED/DOC', true, true)
  on conflict (empresa_id, lower(nome), tipo) do nothing;
end;
$$;

revoke all on function public.financeiro_meios_pagamento_seed(uuid) from public, anon;
grant execute on function public.financeiro_meios_pagamento_seed(uuid) to authenticated, service_role;

-- Seed para empresas existentes
do $$
declare
  r record;
begin
  if to_regclass('public.empresas') is null then
    return;
  end if;

  for r in select id from public.empresas loop
    perform public.financeiro_meios_pagamento_seed(r.id);
  end loop;
end $$;

-- Trigger: ao criar empresa, seed automático
drop function if exists public.tg_fin_meios_pagamento_seed();
create or replace function public.tg_fin_meios_pagamento_seed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.financeiro_meios_pagamento_seed(new.id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.empresas') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_empresas_fin_meios_pag_seed'
      and tgrelid = 'public.empresas'::regclass
  ) then
    create trigger tg_empresas_fin_meios_pag_seed
      after insert on public.empresas
      for each row
      execute procedure public.tg_fin_meios_pagamento_seed();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) RPCs: search + upsert (para “+ criar novo”)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_meios_pagamento_search(public.financeiro_meio_pagamento_tipo, text, int);
create or replace function public.financeiro_meios_pagamento_search(
  p_tipo public.financeiro_meio_pagamento_tipo,
  p_q text,
  p_limit int default 20
)
returns table(
  id uuid,
  nome text,
  tipo public.financeiro_meio_pagamento_tipo
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_tipo = 'pagamento' then
    perform public.require_permission_for_current_user('contas_a_pagar','view');
  else
    perform public.require_permission_for_current_user('contas_a_receber','view');
  end if;

  return query
  select m.id, m.nome, m.tipo
  from public.financeiro_meios_pagamento m
  where m.empresa_id = v_empresa
    and m.tipo = p_tipo
    and m.ativo = true
    and (
      p_q is null
      or length(trim(p_q)) < 2
      or m.nome ilike '%'||trim(p_q)||'%'
    )
  order by m.is_system desc, m.nome asc
  limit greatest(1, least(p_limit, 50));
end;
$$;

revoke all on function public.financeiro_meios_pagamento_search(public.financeiro_meio_pagamento_tipo, text, int) from public, anon;
grant execute on function public.financeiro_meios_pagamento_search(public.financeiro_meio_pagamento_tipo, text, int) to authenticated, service_role;

drop function if exists public.financeiro_meios_pagamento_upsert(jsonb);
create or replace function public.financeiro_meios_pagamento_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_tipo public.financeiro_meio_pagamento_tipo := nullif(p_payload->>'tipo','')::public.financeiro_meio_pagamento_tipo;
  v_nome text := btrim(coalesce(nullif(p_payload->>'nome',''), ''));
  v_ativo boolean := coalesce((p_payload->>'ativo')::boolean, true);
  v_is_system boolean := false;
  v_res jsonb;
begin
  if v_tipo is null then
    raise exception '[FIN][MEIOS] tipo é obrigatório.' using errcode='P0001';
  end if;
  if v_nome = '' then
    raise exception '[FIN][MEIOS] nome é obrigatório.' using errcode='P0001';
  end if;

  if v_tipo = 'pagamento' then
    if v_id is null then
      perform public.require_permission_for_current_user('contas_a_pagar','create');
    else
      perform public.require_permission_for_current_user('contas_a_pagar','update');
    end if;
  else
    if v_id is null then
      perform public.require_permission_for_current_user('contas_a_receber','create');
    else
      perform public.require_permission_for_current_user('contas_a_receber','update');
    end if;
  end if;

  if v_id is null then
    insert into public.financeiro_meios_pagamento (empresa_id, tipo, nome, ativo, is_system)
    values (v_empresa, v_tipo, v_nome, v_ativo, v_is_system)
    on conflict (empresa_id, lower(nome), tipo)
    do update set ativo = excluded.ativo
    returning id into v_id;
  else
    update public.financeiro_meios_pagamento m
       set nome = v_nome,
           ativo = v_ativo,
           updated_at = now()
     where m.id = v_id
       and m.empresa_id = v_empresa
       and m.tipo = v_tipo
       and m.is_system = false
     returning m.id into v_id;

    if v_id is null then
      raise exception '[FIN][MEIOS] Registro não encontrado/negado (ou é system).' using errcode='P0002';
    end if;
  end if;

  select to_jsonb(m.*) into v_res
  from public.financeiro_meios_pagamento m
  where m.id = v_id and m.empresa_id = v_empresa;

  return v_res;
end;
$$;

revoke all on function public.financeiro_meios_pagamento_upsert(jsonb) from public, anon;
grant execute on function public.financeiro_meios_pagamento_upsert(jsonb) to authenticated, service_role;

commit;

