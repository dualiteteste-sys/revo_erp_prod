/*
# [Feature] Módulo de Metas de Vendas (revisado)
- Permissões do módulo 'vendas'
- Enum public.meta_tipo
- Tabela public.metas_vendas + índices + trigger updated_at
- RLS: ENABLE + FORCE + política FOR ALL por empresa
- RPCs com SD + search_path; casts de email para text; funções read-only marcadas como STABLE
*/

-- 1) Permissões do módulo 'vendas'
insert into public.permissions(module, action) values
  ('vendas','view'),('vendas','create'),('vendas','update'),('vendas','delete'),('vendas','manage')
on conflict (module, action) do nothing;

-- OWNER/ADMIN têm acesso total em 'vendas'
insert into public.role_permissions(role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p on p.module = 'vendas'
where r.slug in ('OWNER','ADMIN')
on conflict do nothing;

-- 2) Enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'meta_tipo') then
    create type public.meta_tipo as enum ('valor','quantidade');
  end if;
end
$$;

-- 3) Tabela
create table if not exists public.metas_vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo public.meta_tipo not null default 'valor',
  valor_meta numeric not null check (valor_meta >= 0),
  valor_atingido numeric not null default 0 check (valor_atingido >= 0),
  data_inicio date not null,
  data_fim date not null,
  responsavel_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valor_meta_maior_que_atingido check (valor_meta >= valor_atingido),
  constraint data_fim_maior_que_inicio check (data_fim >= data_inicio)
);

comment on table  public.metas_vendas is 'Tabela para armazenar metas de vendas.';
comment on column public.metas_vendas.nome            is 'Nome da meta (ex: Meta de Vendas - Q4 2025).';
comment on column public.metas_vendas.tipo            is 'Tipo da meta: ''valor'' (monetário) ou ''quantidade'' (unidades).';
comment on column public.metas_vendas.valor_meta      is 'O valor alvo da meta.';
comment on column public.metas_vendas.valor_atingido  is 'O valor atualmente alcançado da meta.';
comment on column public.metas_vendas.data_inicio     is 'Data de início do período da meta.';
comment on column public.metas_vendas.data_fim        is 'Data de término do período da meta.';
comment on column public.metas_vendas.responsavel_id  is 'ID do usuário responsável pela meta.';

-- 4) Índices
create index if not exists ix_metas_vendas_empresa_id     on public.metas_vendas(empresa_id);
create index if not exists ix_metas_vendas_responsavel_id on public.metas_vendas(responsavel_id);

-- 5) RLS
alter table public.metas_vendas enable row level security;
alter table public.metas_vendas force row level security;

drop policy if exists metas_vendas_all_company_members on public.metas_vendas;
create policy metas_vendas_all_company_members
on public.metas_vendas
for all
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

-- 6) Trigger updated_at
drop trigger if exists tg_metas_vendas_updated on public.metas_vendas;
create trigger tg_metas_vendas_updated
  before update on public.metas_vendas
  for each row execute function public.tg_set_updated_at();

-- 7) RPCs

-- 7.1) Listar metas (read-only, STABLE)
drop function if exists public.list_metas_vendas(text, int, int);
create or replace function public.list_metas_vendas(
  p_q     text default null,
  p_limit int  default 20,
  p_offset int default 0
)
returns table(
  id uuid,
  nome text,
  descricao text,
  tipo public.meta_tipo,
  valor_meta numeric,
  valor_atingido numeric,
  data_inicio date,
  data_fim date,
  responsavel_id uuid,
  responsavel_email text,
  responsavel_nome text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission_for_current_user('vendas','view') then
    raise exception 'PERMISSION_DENIED';
  end if;

  return query
  select
    m.id,
    m.nome,
    m.descricao,
    m.tipo,
    m.valor_meta,
    m.valor_atingido,
    m.data_inicio,
    m.data_fim,
    m.responsavel_id,
    (u.email)::text as responsavel_email,                 -- cast para text
    (u.raw_user_meta_data->>'name') as responsavel_nome,
    m.created_at
  from public.metas_vendas m
  left join auth.users u on u.id = m.responsavel_id
  where m.empresa_id = public.current_empresa_id()
    and (p_q is null or m.nome ilike '%'||p_q||'%' or (u.raw_user_meta_data->>'name') ilike '%'||p_q||'%')
  order by m.data_fim desc, m.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
end;
$$;
revoke all on function public.list_metas_vendas(text, int, int) from public;
grant  execute on function public.list_metas_vendas(text, int, int) to authenticated;

-- 7.2) Criar/Atualizar meta
drop function if exists public.create_update_meta_venda(jsonb);
create or replace function public.create_update_meta_venda(p_payload jsonb)
returns public.metas_vendas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_empresa_id uuid := public.current_empresa_id();
  result public.metas_vendas;
begin
  if v_id is null then
    if not public.has_permission_for_current_user('vendas','create') then
      raise exception 'PERMISSION_DENIED';
    end if;

    insert into public.metas_vendas
      (empresa_id, nome, descricao, tipo, valor_meta, valor_atingido, data_inicio, data_fim, responsavel_id)
    values
      (
        v_empresa_id,
        p_payload->>'nome',
        p_payload->>'descricao',
        (p_payload->>'tipo')::public.meta_tipo,
        (p_payload->>'valor_meta')::numeric,
        coalesce((p_payload->>'valor_atingido')::numeric, 0),   -- COALESCE para NOT NULL
        (p_payload->>'data_inicio')::date,
        (p_payload->>'data_fim')::date,
        nullif(p_payload->>'responsavel_id','')::uuid
      )
    returning * into result;
  else
    if not public.has_permission_for_current_user('vendas','update') then
      raise exception 'PERMISSION_DENIED';
    end if;

    update public.metas_vendas
       set nome           = p_payload->>'nome',
           descricao      = p_payload->>'descricao',
           tipo           = (p_payload->>'tipo')::public.meta_tipo,
           valor_meta     = (p_payload->>'valor_meta')::numeric,
           valor_atingido = coalesce((p_payload->>'valor_atingido')::numeric, valor_atingido), -- preserva se null
           data_inicio    = (p_payload->>'data_inicio')::date,
           data_fim       = (p_payload->>'data_fim')::date,
           responsavel_id = nullif(p_payload->>'responsavel_id','')::uuid
     where id = v_id and empresa_id = v_empresa_id
     returning * into result;
  end if;

  return result;
end;
$$;
revoke all on function public.create_update_meta_venda(jsonb) from public;
grant  execute on function public.create_update_meta_venda(jsonb) to authenticated;

-- 7.3) Deletar meta
drop function if exists public.delete_meta_venda(uuid);
create or replace function public.delete_meta_venda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_permission_for_current_user('vendas','delete') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.metas_vendas
   where id = p_id
     and empresa_id = public.current_empresa_id();
end;
$$;
revoke all on function public.delete_meta_venda(uuid) from public;
grant  execute on function public.delete_meta_venda(uuid) to authenticated;

-- 7.4) Auto-complete de responsáveis (read-only, STABLE)
drop function if exists public.search_users_for_goal(text);
create or replace function public.search_users_for_goal(p_q text default null)
returns table (id uuid, nome text, email text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    u.id,
    (u.raw_user_meta_data->>'name')::text as nome,
    (u.email)::text                       as email   -- cast para text
  from public.empresa_usuarios eu
  join auth.users u on u.id = eu.user_id
  where eu.empresa_id = public.current_empresa_id()
    and eu.status = 'ACTIVE'
    and (p_q is null
         or (u.raw_user_meta_data->>'name') ilike '%'||p_q||'%'
         or u.email ilike '%'||p_q||'%')
  order by (u.raw_user_meta_data->>'name')
  limit 10;
end;
$$;
revoke all on function public.search_users_for_goal(text) from public;
grant  execute on function public.search_users_for_goal(text) to authenticated;

-- 8) PostgREST: reload
select pg_notify('pgrst','reload schema');
