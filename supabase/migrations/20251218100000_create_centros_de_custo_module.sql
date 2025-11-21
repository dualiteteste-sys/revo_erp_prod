/*
# [Module] Centros de Custo

This migration creates the `centros_de_custo` table and all necessary functions (RPCs) and security policies (RLS) to manage cost centers within the application. It establishes a multi-tenant structure where each cost center is linked to a specific `empresa_id`.

## Query Description:
This is a structural migration that adds a new, isolated module to the database. It does not affect existing data in other tables. The script is idempotent, meaning it can be run multiple times without causing errors; it will only create objects that do not already exist.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (with a corresponding DROP script)

## Structure Details:
- **Tables Created:** `public.centros_de_custo`
- **Functions Created:** `list_centros_de_custo`, `count_centros_de_custo`, `get_centro_de_custo_details`, `create_update_centro_de_custo`, `delete_centro_de_custo`, `tg_set_updated_at`
- **Triggers Created:** `set_updated_at` on `public.centros_de_custo`
- **Policies Created:** `centros_de_custo_select_own`, `centros_de_custo_insert_own`, `centros_de_custo_update_own`, `centros_de_custo_delete_own`

## Security Implications:
- RLS Status: Enabled on `public.centros_de_custo`.
- Policy Changes: Yes, new policies are created to ensure users can only access data belonging to their active company.
- Auth Requirements: All operations require an authenticated user session.

## Performance Impact:
- Indexes: Adds B-tree and functional indexes on `empresa_id`, `status`, `nome`, and `codigo` to optimize filtering and searching operations.
- Triggers: Adds a lightweight `updated_at` trigger.
- Estimated Impact: Low. The impact is isolated to the new table and its related queries.
*/

/* ============================================================
   public.centros_de_custo  (multi-tenant, RLS por operação)
   ============================================================ */

-- 0) Tabela
create table if not exists public.centros_de_custo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        varchar not null,
  codigo      varchar,
  status      varchar not null default 'ativo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_centros_de_custo_empresa_codigo unique (empresa_id, codigo),
  constraint uq_centros_de_custo_empresa_nome   unique (empresa_id, nome)
);

-- Índices
create index if not exists ix_centros_de_custo_empresa_id on public.centros_de_custo (empresa_id);
create index if not exists ix_centros_de_custo_status     on public.centros_de_custo (empresa_id, status);
-- Busca por ILIKE nome/codigo → índices funcionais
create index if not exists ix_centros_de_custo_nome_lower   on public.centros_de_custo (empresa_id, lower(nome));
create index if not exists ix_centros_de_custo_codigo_lower on public.centros_de_custo (empresa_id, lower(codigo));

-- 1) RLS
alter table public.centros_de_custo enable row level security;

-- Limpeza de policies antigas (idempotente)
drop policy if exists centros_de_custo_select_own on public.centros_de_custo;
drop policy if exists centros_de_custo_insert_own on public.centros_de_custo;
drop policy if exists centros_de_custo_update_own on public.centros_de_custo;
drop policy if exists centros_de_custo_delete_own on public.centros_de_custo;

-- SELECT: membros da empresa
create policy centros_de_custo_select_own
on public.centros_de_custo
for select
using ( public.is_user_member_of(empresa_id) );

-- INSERT: apenas no tenant atual e sendo membro
create policy centros_de_custo_insert_own
on public.centros_de_custo
for insert
with check (
  public.is_user_member_of(empresa_id)
  and empresa_id = public.current_empresa_id()
);

-- UPDATE: manter-se dentro do tenant atual e sendo membro
create policy centros_de_custo_update_own
on public.centros_de_custo
for update
using ( public.is_user_member_of(empresa_id) )
with check (
  public.is_user_member_of(empresa_id)
  and empresa_id = public.current_empresa_id()
);

-- DELETE: somente membros
create policy centros_de_custo_delete_own
on public.centros_de_custo
for delete
using ( public.is_user_member_of(empresa_id) );

-- 2) Trigger updated_at
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.centros_de_custo;
create trigger set_updated_at
before update on public.centros_de_custo
for each row execute function public.tg_set_updated_at();

-- 3) RPCs (todas security invoker; RLS efetiva)

-- list_centros_de_custo
create or replace function public.list_centros_de_custo(
  p_limit int default 50,
  p_offset int default 0,
  p_q text default null,
  p_status varchar default null,
  p_order_by text default 'nome',
  p_order_dir text default 'asc'
)
returns table(id uuid, nome varchar, codigo varchar, status varchar)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then return; end if;

  return query
  select c.id, c.nome, c.codigo, c.status
  from public.centros_de_custo c
  where c.empresa_id = v_emp
    and (p_q is null or lower(c.nome) like '%'||lower(p_q)||'%' or lower(c.codigo) like '%'||lower(p_q)||'%')
    and (p_status is null or c.status = p_status)
  order by
    case when p_order_by='nome'   and p_order_dir='asc'  then c.nome   end asc,
    case when p_order_by='nome'   and p_order_dir='desc' then c.nome   end desc,
    case when p_order_by='codigo' and p_order_dir='asc'  then c.codigo end asc,
    case when p_order_by='codigo' and p_order_dir='desc' then c.codigo end desc,
    case when p_order_by='status' and p_order_dir='asc'  then c.status end asc,
    case when p_order_by='status' and p_order_dir='desc' then c.status end desc,
    c.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_centros_de_custo(int,int,text,varchar,text,text) from public;
grant execute on function public.list_centros_de_custo(int,int,text,varchar,text,text) to authenticated;

-- count_centros_de_custo
create or replace function public.count_centros_de_custo(
  p_q text default null,
  p_status varchar default null
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then return 0; end if;

  return (
    select count(*)
    from public.centros_de_custo c
    where c.empresa_id = v_emp
      and (p_q is null or lower(c.nome) like '%'||lower(p_q)||'%' or lower(c.codigo) like '%'||lower(p_q)||'%')
      and (p_status is null or c.status = p_status)
  );
end;
$$;

revoke all on function public.count_centros_de_custo(text,varchar) from public;
grant execute on function public.count_centros_de_custo(text,varchar) to authenticated;

-- get_centro_de_custo_details
create or replace function public.get_centro_de_custo_details(p_id uuid)
returns table (
  id uuid,
  empresa_id uuid,
  nome varchar,
  codigo varchar,
  status varchar,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  select c.id, c.empresa_id, c.nome, c.codigo, c.status, c.created_at, c.updated_at
  from public.centros_de_custo c
  where c.id = p_id
    and c.empresa_id = public.current_empresa_id();
end;
$$;

revoke all on function public.get_centro_de_custo_details(uuid) from public;
grant execute on function public.get_centro_de_custo_details(uuid) to authenticated;

-- create_update_centro_de_custo
create or replace function public.create_update_centro_de_custo(p_payload jsonb)
returns table (
  id uuid,
  empresa_id uuid,
  nome varchar,
  codigo varchar,
  status varchar,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_emp uuid := public.current_empresa_id();
  v_nome  varchar := nullif(p_payload->>'nome','');
  v_codigo varchar := nullif(p_payload->>'codigo','');
  v_status varchar := coalesce(nullif(p_payload->>'status',''),'ativo');
begin
  if v_emp is null then
    raise exception 'NO_ACTIVE_TENANT';
  end if;

  if v_id is null then
    insert into public.centros_de_custo (empresa_id, nome, codigo, status)
    values (v_emp, v_nome, v_codigo, v_status)
    returning centros_de_custo.id, centros_de_custo.empresa_id, centros_de_custo.nome, centros_de_custo.codigo, centros_de_custo.status, centros_de_custo.created_at, centros_de_custo.updated_at
    into get_centro_de_custo_details.id, get_centro_de_custo_details.empresa_id, get_centro_de_custo_details.nome, get_centro_de_custo_details.codigo, get_centro_de_custo_details.status, get_centro_de_custo_details.created_at, get_centro_de_custo_details.updated_at;
  else
    update public.centros_de_custo
       set nome   = v_nome,
           codigo = v_codigo,
           status = v_status
     where centros_de_custo.id = v_id
       and centros_de_custo.empresa_id = v_emp
    returning centros_de_custo.id, centros_de_custo.empresa_id, centros_de_custo.nome, centros_de_custo.codigo, centros_de_custo.status, centros_de_custo.created_at, centros_de_custo.updated_at
    into get_centro_de_custo_details.id, get_centro_de_custo_details.empresa_id, get_centro_de_custo_details.nome, get_centro_de_custo_details.codigo, get_centro_de_custo_details.status, get_centro_de_custo_details.created_at, get_centro_de_custo_details.updated_at;
  end if;
end;
$$;

revoke all on function public.create_update_centro_de_custo(jsonb) from public;
grant execute on function public.create_update_centro_de_custo(jsonb) to authenticated;

-- delete_centro_de_custo
create or replace function public.delete_centro_de_custo(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  delete from public.centros_de_custo
   where id = p_id
     and empresa_id = public.current_empresa_id();
end;
$$;

revoke all on function public.delete_centro_de_custo(uuid) from public;
grant execute on function public.delete_centro_de_custo(uuid) to authenticated;
