-- [MIGRATION] RPCs para CRUD de Transportadoras

-- 1) Listagem (SECURITY INVOKER; RLS aplica)
create or replace function public.list_transportadoras(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_order  text    default 'nome_razao_social asc'
)
returns table (
  id uuid,
  nome_razao_social text,
  nome_fantasia text,
  cnpj_cpf text,
  telefone text,
  cidade text,
  uf text,
  ativo boolean
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with base as (
    select t.id, t.nome_razao_social, t.nome_fantasia, t.cnpj_cpf, t.telefone, t.cidade, t.uf, t.ativo
    from public.transportadoras t
    where (
        p_q is null
        or t.nome_razao_social ilike '%' || p_q || '%'
        or t.nome_fantasia ilike '%' || p_q || '%'
        or t.cnpj_cpf ilike '%' || p_q || '%'
      )
  ),
  ordered as (
    select * from base
    order by
      case when lower(p_order) = 'nome_razao_social asc'  then nome_razao_social end asc nulls last,
      case when lower(p_order) = 'nome_razao_social desc' then nome_razao_social end desc nulls last,
      created_at desc
  )
  select * from ordered
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- 2) Contagem (SECURITY INVOKER; RLS aplica)
create or replace function public.count_transportadoras(
  p_q    text default null
)
returns bigint
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.transportadoras t
  where (
      p_q is null
      or t.nome_razao_social ilike '%' || p_q || '%'
      or t.nome_fantasia ilike '%' || p_q || '%'
      or t.cnpj_cpf ilike '%' || p_q || '%'
    );
$$;

-- 3) Detalhe (SECURITY INVOKER; RLS aplica)
create or replace function public.get_transportadora_details(p_id uuid)
returns public.transportadoras
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from public.transportadoras where id = p_id;
$$;

-- 4) Create/Update transacional (SECURITY DEFINER)
create or replace function public.create_update_transportadora(p_payload jsonb)
returns public.transportadoras
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_carrier_id uuid;
  v_result public.transportadoras;
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  v_carrier_id := nullif(p_payload ->> 'id','')::uuid;

  if v_carrier_id is null then
    insert into public.transportadoras (
      empresa_id, ativo, nome_razao_social, nome_fantasia, cnpj_cpf, ie, ie_isento,
      telefone, email, cep, logradouro, numero, complemento, bairro, cidade, uf, observacoes
    )
    values (
      v_empresa_id,
      (p_payload ->> 'ativo')::boolean,
      p_payload ->> 'nome_razao_social',
      nullif(p_payload ->> 'nome_fantasia', ''),
      nullif(p_payload ->> 'cnpj_cpf', ''),
      nullif(p_payload ->> 'ie', ''),
      (p_payload ->> 'ie_isento')::boolean,
      nullif(p_payload ->> 'telefone', ''),
      nullif(p_payload ->> 'email', ''),
      nullif(p_payload ->> 'cep', ''),
      nullif(p_payload ->> 'logradouro', ''),
      nullif(p_payload ->> 'numero', ''),
      nullif(p_payload ->> 'complemento', ''),
      nullif(p_payload ->> 'bairro', ''),
      nullif(p_payload ->> 'cidade', ''),
      nullif(p_payload ->> 'uf', ''),
      nullif(p_payload ->> 'observacoes', '')
    )
    returning * into v_result;
  else
    update public.transportadoras set
      ativo = (p_payload ->> 'ativo')::boolean,
      nome_razao_social = p_payload ->> 'nome_razao_social',
      nome_fantasia = nullif(p_payload ->> 'nome_fantasia', ''),
      cnpj_cpf = nullif(p_payload ->> 'cnpj_cpf', ''),
      ie = nullif(p_payload ->> 'ie', ''),
      ie_isento = (p_payload ->> 'ie_isento')::boolean,
      telefone = nullif(p_payload ->> 'telefone', ''),
      email = nullif(p_payload ->> 'email', ''),
      cep = nullif(p_payload ->> 'cep', ''),
      logradouro = nullif(p_payload ->> 'logradouro', ''),
      numero = nullif(p_payload ->> 'numero', ''),
      complemento = nullif(p_payload ->> 'complemento', ''),
      bairro = nullif(p_payload ->> 'bairro', ''),
      cidade = nullif(p_payload ->> 'cidade', ''),
      uf = nullif(p_payload ->> 'uf', ''),
      observacoes = nullif(p_payload ->> 'observacoes', ''),
      updated_at = now()
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

-- 5) Delete (SECURITY DEFINER; escopo por empresa)
create or replace function public.delete_transportadora(p_id uuid)
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
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Transportadora não encontrada ou não pertence à empresa.' using errcode = '23503';
  end if;
end;
$$;

-- 6) Permissões
grant execute on function public.list_transportadoras to authenticated;
grant execute on function public.count_transportadoras to authenticated;
grant execute on function public.get_transportadora_details to authenticated;
grant execute on function public.create_update_transportadora to authenticated;
grant execute on function public.delete_transportadora to authenticated;
