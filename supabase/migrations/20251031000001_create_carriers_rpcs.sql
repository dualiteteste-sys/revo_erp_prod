-- [MIGRATION] Cria as RPCs para o CRUD de transportadoras.
-- Padrões do projeto: SECURITY DEFINER para escrita, SECURITY INVOKER para leitura, search_path seguro.

-- 1) Listagem (READ)
create or replace function public.list_carriers(
  p_limit  integer default 15,
  p_offset integer default 0,
  p_q      text    default null,
  p_status public.status_transportadora default null,
  p_order  text    default 'nome_razao_social asc'
)
returns table (
  id uuid,
  nome_razao_social text,
  cnpj text,
  inscr_estadual text,
  status public.status_transportadora,
  created_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select t.id, t.nome_razao_social, t.cnpj, t.inscr_estadual, t.status, t.created_at
  from public.transportadoras t
  where (p_status is null or t.status = p_status)
    and (
      p_q is null
      or t.nome_razao_social ilike '%' || p_q || '%'
      or t.nome_fantasia ilike '%' || p_q || '%'
      or t.cnpj ilike '%' || p_q || '%'
    )
  order by
    case when lower(p_order) = 'nome_razao_social asc'  then nome_razao_social end asc nulls last,
    case when lower(p_order) = 'nome_razao_social desc' then nome_razao_social end desc nulls last,
    created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- 2) Contagem (READ)
create or replace function public.count_carriers(
  p_q      text    default null,
  p_status public.status_transportadora default null
)
returns bigint
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.transportadoras t
  where (p_status is null or t.status = p_status)
    and (
      p_q is null
      or t.nome_razao_social ilike '%' || p_q || '%'
      or t.nome_fantasia ilike '%' || p_q || '%'
      or t.cnpj ilike '%' || p_q || '%'
    );
$$;

-- 3) Detalhes (READ)
create or replace function public.get_carrier_details(p_id uuid)
returns public.transportadoras
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from public.transportadoras where id = p_id;
$$;

-- 4) Create/Update (WRITE)
create or replace function public.create_update_carrier(p_payload jsonb)
returns public.transportadoras
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_carrier_id uuid := nullif(p_payload ->> 'id','')::uuid;
  v_result public.transportadoras;
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  if v_carrier_id is null then
    insert into public.transportadoras (
      empresa_id, nome_razao_social, nome_fantasia, cnpj, inscr_estadual, status
    )
    values (
      v_empresa_id,
      p_payload ->> 'nome_razao_social',
      nullif(p_payload ->> 'nome_fantasia',''),
      nullif(p_payload ->> 'cnpj',''),
      nullif(p_payload ->> 'inscr_estadual',''),
      (p_payload ->> 'status')::public.status_transportadora
    )
    returning * into v_result;
  else
    update public.transportadoras set
      nome_razao_social = coalesce(p_payload ->> 'nome_razao_social', nome_razao_social),
      nome_fantasia     = coalesce(nullif(p_payload ->> 'nome_fantasia',''), nome_fantasia),
      cnpj              = coalesce(nullif(p_payload ->> 'cnpj',''), cnpj),
      inscr_estadual    = coalesce(nullif(p_payload ->> 'inscr_estadual',''), inscr_estadual),
      status            = coalesce((p_payload ->> 'status')::public.status_transportadora, status),
      updated_at        = now()
    where id = v_carrier_id
      and empresa_id = v_empresa_id
    returning * into v_result;

    if not found then
      raise exception 'Transportadora não encontrada ou não pertence à empresa.' using errcode = '23503';
    end if;
  end if;

  return v_result;
end;
$$;

-- 5) Delete (WRITE)
create or replace function public.delete_carrier(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  delete from public.transportadoras
  where id = p_id and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Transportadora não encontrada ou não pertence à empresa.' using errcode = '23503';
  end if;
end;
$$;

-- 6) Permissões
grant execute on function public.list_carriers(integer, integer, text, public.status_transportadora, text) to authenticated;
grant execute on function public.count_carriers(text, public.status_transportadora) to authenticated;
grant execute on function public.get_carrier_details(uuid) to authenticated;
grant execute on function public.create_update_carrier(jsonb) to authenticated;
grant execute on function public.delete_carrier(uuid) to authenticated;
