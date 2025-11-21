/*
  # [SCHEMA] Módulo de Transportadoras

  Este script cria a estrutura completa para o gerenciamento de transportadoras,
  incluindo a tabela `transportadoras` e todas as RPCs necessárias para CRUD.

  ## Detalhes da Estrutura:
  - Tabela: `public.transportadoras`
  - Enum: `public.status_transportadora`
  - Funções RPC:
    - `list_carriers`: Lista transportadoras com paginação, busca e filtro.
    - `count_carriers`: Conta o total de transportadoras para paginação.
    - `get_carrier_details`: Obtém os detalhes de uma única transportadora.
    - `create_update_carrier`: Cria ou atualiza uma transportadora.
    - `delete_carrier`: Remove uma transportadora.

  ## Segurança:
  - RLS: Todas as operações na tabela `transportadoras` são protegidas por RLS,
    garantindo que um usuário só possa acessar dados da sua própria empresa.
  - RPCs de Escrita: Usam `SECURITY DEFINER` para operar com privilégios elevados,
    mas validam a permissão do usuário com `is_user_member_of`.
*/

-- Enum para o status da transportadora
create type public.status_transportadora as enum ('ativa', 'inativa');

-- Tabela de Transportadoras
create table if not exists public.transportadoras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome_razao_social text not null,
  nome_fantasia text,
  cnpj text,
  inscr_estadual text,
  status public.status_transportadora not null default 'ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ux_transportadoras_empresa_cnpj unique (empresa_id, cnpj)
);

-- Índices
create index if not exists idx_transportadoras_empresa on public.transportadoras(empresa_id);
create index if not exists idx_transportadoras_status on public.transportadoras(status);

-- Trigger de updated_at
drop trigger if exists tg_transportadoras_updated_at on public.transportadoras;
create trigger tg_transportadoras_updated_at
before update on public.transportadoras
for each row execute function public.tg_set_updated_at();

-- RLS
alter table public.transportadoras enable row level security;

drop policy if exists transportadoras_sel on public.transportadoras;
create policy transportadoras_sel on public.transportadoras
  for select using (public.is_user_member_of(empresa_id));

drop policy if exists transportadoras_ins on public.transportadoras;
create policy transportadoras_ins on public.transportadoras
  for insert with check (public.is_user_member_of(empresa_id));

drop policy if exists transportadoras_upd on public.transportadoras;
create policy transportadoras_upd on public.transportadoras
  for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));

drop policy if exists transportadoras_del on public.transportadoras;
create policy transportadoras_del on public.transportadoras
  for delete using (public.is_user_member_of(empresa_id));

-- RPC para listar transportadoras
create or replace function public.list_carriers(
  p_limit int default 20,
  p_offset int default 0,
  p_q text default null,
  p_status public.status_transportadora default null,
  p_order text default 'nome_razao_social asc'
)
returns table (
  id uuid,
  nome_razao_social text,
  cnpj text,
  inscr_estadual text,
  status public.status_transportadora,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] user not member of company';
  end if;

  return query
  select
    t.id,
    t.nome_razao_social,
    t.cnpj,
    t.inscr_estadual,
    t.status,
    t.created_at
  from public.transportadoras t
  where
    t.empresa_id = v_empresa_id
    and (p_status is null or t.status = p_status)
    and (
      p_q is null or
      t.nome_razao_social ilike '%' || p_q || '%' or
      t.nome_fantasia ilike '%' || p_q || '%' or
      t.cnpj ilike '%' || p_q || '%'
    )
  order by
    case when p_order = 'nome_razao_social asc' then t.nome_razao_social end asc,
    case when p_order = 'nome_razao_social desc' then t.nome_razao_social end desc,
    t.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;
grant execute on function public.list_carriers to authenticated;

-- RPC para contar transportadoras
create or replace function public.count_carriers(
  p_q text default null,
  p_status public.status_transportadora default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_count int;
begin
  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] user not member of company';
  end if;

  select count(*) into v_count
  from public.transportadoras t
  where
    t.empresa_id = v_empresa_id
    and (p_status is null or t.status = p_status)
    and (
      p_q is null or
      t.nome_razao_social ilike '%' || p_q || '%' or
      t.nome_fantasia ilike '%' || p_q || '%' or
      t.cnpj ilike '%' || p_q || '%'
    );
  return v_count;
end;
$$;
grant execute on function public.count_carriers to authenticated;

-- RPC para obter detalhes de uma transportadora
create or replace function public.get_carrier_details(p_id uuid)
returns public.transportadoras
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_carrier public.transportadoras;
begin
  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] user not member of company';
  end if;

  select * into v_carrier
  from public.transportadoras
  where id = p_id and empresa_id = v_empresa_id;

  return v_carrier;
end;
$$;
grant execute on function public.get_carrier_details to authenticated;

-- RPC para criar/atualizar transportadora
create or replace function public.create_update_carrier(p_payload jsonb)
returns public.transportadoras
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid := (p_payload->>'id')::uuid;
  v_carrier public.transportadoras;
begin
  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] user not member of company';
  end if;

  if v_id is not null then
    -- Update
    update public.transportadoras
    set
      nome_razao_social = p_payload->>'nome_razao_social',
      nome_fantasia = p_payload->>'nome_fantasia',
      cnpj = p_payload->>'cnpj',
      inscr_estadual = p_payload->>'inscr_estadual',
      status = (p_payload->>'status')::public.status_transportadora
    where id = v_id and empresa_id = v_empresa_id
    returning * into v_carrier;
  else
    -- Create
    insert into public.transportadoras (
      empresa_id,
      nome_razao_social,
      nome_fantasia,
      cnpj,
      inscr_estadual,
      status
    ) values (
      v_empresa_id,
      p_payload->>'nome_razao_social',
      p_payload->>'nome_fantasia',
      p_payload->>'cnpj',
      p_payload->>'inscr_estadual',
      (p_payload->>'status')::public.status_transportadora
    )
    returning * into v_carrier;
  end if;

  return v_carrier;
end;
$$;
grant execute on function public.create_update_carrier to authenticated;

-- RPC para deletar transportadora
create or replace function public.delete_carrier(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] user not member of company';
  end if;

  delete from public.transportadoras
  where id = p_id and empresa_id = v_empresa_id;
end;
$$;
grant execute on function public.delete_carrier to authenticated;
