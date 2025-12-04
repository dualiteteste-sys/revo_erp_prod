-- Create produto_grupos table
create table if not exists "public"."produto_grupos" (
  "id" uuid not null default gen_random_uuid(),
  "empresa_id" uuid not null,
  "nome" text not null,
  "parent_id" uuid,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "produto_grupos_pkey" primary key ("id"),
  constraint "produto_grupos_empresa_id_fkey" foreign key ("empresa_id") references "public"."empresas" ("id") on delete cascade,
  constraint "produto_grupos_parent_id_fkey" foreign key ("parent_id") references "public"."produto_grupos" ("id") on delete set null
);

-- Add grupo_id to produtos
alter table "public"."produtos" 
add column if not exists "grupo_id" uuid references "public"."produto_grupos" ("id") on delete set null;

-- Enable RLS
alter table "public"."produto_grupos" enable row level security;

-- Policies for produto_grupos
create policy "produto_grupos_select"
on "public"."produto_grupos"
as permissive
for select
to public
using ((empresa_id = public.current_empresa_id()));

create policy "produto_grupos_insert"
on "public"."produto_grupos"
as permissive
for insert
to public
with check ((empresa_id = public.current_empresa_id()));

create policy "produto_grupos_update"
on "public"."produto_grupos"
as permissive
for update
to public
using ((empresa_id = public.current_empresa_id()))
with check ((empresa_id = public.current_empresa_id()));

create policy "produto_grupos_delete"
on "public"."produto_grupos"
as permissive
for delete
to public
using ((empresa_id = public.current_empresa_id()));

-- Grants
grant select, insert, update, delete on table "public"."produto_grupos" to "authenticated";
grant select, insert, update, delete on table "public"."produto_grupos" to "service_role";

-- RPC: List Groups
create or replace function public.list_produto_grupos(p_search text default null)
returns table (
  id uuid,
  nome text,
  parent_id uuid,
  created_at timestamptz,
  parent_nome text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  return query
  select
    g.id,
    g.nome,
    g.parent_id,
    g.created_at,
    p.nome as parent_nome
  from public.produto_grupos g
  left join public.produto_grupos p on p.id = g.parent_id
  where g.empresa_id = public.current_empresa_id()
    and (p_search is null or g.nome ilike '%' || p_search || '%')
  order by g.nome;
end;
$function$;

-- RPC: Upsert Group
create or replace function public.upsert_produto_grupo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid;
  v_result jsonb;
begin
  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome do grupo é obrigatório.';
  end if;

  if p_payload->>'id' is not null then
    update public.produto_grupos
    set
      nome = p_payload->>'nome',
      parent_id = (p_payload->>'parent_id')::uuid,
      updated_at = now()
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.produto_grupos (
      empresa_id,
      nome,
      parent_id
    ) values (
      v_empresa_id,
      p_payload->>'nome',
      (p_payload->>'parent_id')::uuid
    )
    returning id into v_id;
  end if;

  select to_jsonb(g.*) into v_result
  from public.produto_grupos g
  where g.id = v_id;

  return v_result;
end;
$function$;

-- RPC: Delete Group
create or replace function public.delete_produto_grupo(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  -- Optional: Check if used in products? 
  -- For now, we let the foreign key 'set null' handle it on products, 
  -- OR we can block deletion if used. Let's block for safety if it has products.
  
  if exists (select 1 from public.produtos where grupo_id = p_id) then
    raise exception 'Não é possível excluir este grupo pois existem produtos vinculados a ele.';
  end if;

  delete from public.produto_grupos
  where id = p_id
    and empresa_id = public.current_empresa_id();
end;
$function$;
