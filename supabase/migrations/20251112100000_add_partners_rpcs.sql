/*
  # [MIGRATION] CRUD de Parceiros (Pessoas) — versão endurecida
  Ajustes:
  - Trata arrays nulos com COALESCE para '[]'
  - Delete de filhos apenas se o array correspondente for enviado (replace semantics)
  - Casts seguros com nullif(...,'')::type
*/

-- 1) Listagem (SECURITY INVOKER; RLS aplica)
create or replace function public.list_partners(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_tipo   public.pessoa_tipo default null,
  p_order  text    default 'created_at desc'
)
returns table (
  id uuid,
  nome text,
  tipo public.pessoa_tipo,
  doc_unico text,
  email text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with base as (
    select p.id, p.nome, p.tipo, p.doc_unico, p.email, p.created_at, p.updated_at
    from public.pessoas p
    where (p_tipo is null or p.tipo = p_tipo)
      and (
        p_q is null
        or p.nome ilike '%' || p_q || '%'
        or p.doc_unico ilike '%' || p_q || '%'
        or p.email ilike '%' || p_q || '%'
      )
  ),
  ordered as (
    select * from base
    order by
      case when lower(p_order) = 'nome asc'         then nome end asc nulls last,
      case when lower(p_order) = 'nome desc'        then nome end desc nulls last,
      case when lower(p_order) = 'created_at asc'   then created_at end asc nulls last,
      case when lower(p_order) = 'created_at desc'  then created_at end desc nulls last,
      created_at desc
  )
  select * from ordered
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- 2) Contagem (SECURITY INVOKER; RLS aplica)
create or replace function public.count_partners(
  p_q    text default null,
  p_tipo public.pessoa_tipo default null
)
returns bigint
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.pessoas p
  where (p_tipo is null or p.tipo = p_tipo)
    and (
      p_q is null
      or p.nome ilike '%' || p_q || '%'
      or p.doc_unico ilike '%' || p_q || '%'
      or p.email ilike '%' || p_q || '%'
    );
$$;

-- 3) Detalhe (SECURITY INVOKER; RLS aplica em todas as tabelas)
create or replace function public.get_partner_details(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select to_jsonb(p) || jsonb_build_object(
    'enderecos', coalesce(
      (select jsonb_agg(e) from public.pessoa_enderecos e where e.pessoa_id = p.id),
      '[]'::jsonb
    ),
    'contatos', coalesce(
      (select jsonb_agg(c) from public.pessoa_contatos c where c.pessoa_id = p.id),
      '[]'::jsonb
    )
  )
  from public.pessoas p
  where p.id = p_id;
$$;

-- 4) Create/Update transacional (SECURITY DEFINER)
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_id uuid;
  v_pessoa_payload jsonb := coalesce(p_payload -> 'pessoa', '{}'::jsonb);
  v_enderecos_payload jsonb := p_payload -> 'enderecos'; -- pode ser null/array
  v_contatos_payload  jsonb := p_payload -> 'contatos';  -- pode ser null/array
  v_endereco jsonb;
  v_contato jsonb;
  v_endereco_ids_in_payload uuid[] := '{}';
  v_contato_ids_in_payload uuid[]  := '{}';
  v_has_enderecos boolean := (jsonb_typeof(v_enderecos_payload) = 'array');
  v_has_contatos  boolean := (jsonb_typeof(v_contatos_payload)  = 'array');
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  -- Upsert Pessoa (parcial: só sobrescreve o que veio)
  v_pessoa_id := nullif(v_pessoa_payload ->> 'id','')::uuid;

  if v_pessoa_id is null then
    insert into public.pessoas (
      empresa_id, tipo, nome, doc_unico, email, telefone,
      inscr_estadual, isento_ie, inscr_municipal, observacoes
    )
    values (
      v_empresa_id,
      nullif(v_pessoa_payload->>'tipo','')::public.pessoa_tipo,
      v_pessoa_payload ->> 'nome',
      nullif(v_pessoa_payload ->> 'doc_unico',''),
      nullif(v_pessoa_payload ->> 'email',''),
      nullif(v_pessoa_payload ->> 'telefone',''),
      nullif(v_pessoa_payload ->> 'inscr_estadual',''),
      nullif(v_pessoa_payload ->> 'isento_ie','')::boolean,
      nullif(v_pessoa_payload ->> 'inscr_municipal',''),
      nullif(v_pessoa_payload ->> 'observacoes','')
    )
    returning id into v_pessoa_id;
  else
    update public.pessoas set
      tipo             = coalesce(nullif(v_pessoa_payload->>'tipo','')::public.pessoa_tipo, tipo),
      nome             = coalesce(v_pessoa_payload->>'nome', nome),
      doc_unico        = coalesce(nullif(v_pessoa_payload->>'doc_unico',''), doc_unico),
      email            = coalesce(nullif(v_pessoa_payload->>'email',''), email),
      telefone         = coalesce(nullif(v_pessoa_payload->>'telefone',''), telefone),
      inscr_estadual   = coalesce(nullif(v_pessoa_payload->>'inscr_estadual',''), inscr_estadual),
      isento_ie        = coalesce(nullif(v_pessoa_payload->>'isento_ie','')::boolean, isento_ie),
      inscr_municipal  = coalesce(nullif(v_pessoa_payload->>'inscr_municipal',''), inscr_municipal),
      observacoes      = coalesce(nullif(v_pessoa_payload->>'observacoes',''), observacoes),
      updated_at       = now()
    where id = v_pessoa_id
      and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Parceiro não encontrado ou não pertence à empresa.' using errcode = '23503';
    end if;
  end if;

  -- Endereços (somente se o array foi enviado; semantics = "replace set")
  if v_has_enderecos then
    for v_endereco in
      select * from jsonb_array_elements(coalesce(v_enderecos_payload, '[]'::jsonb))
    loop
      if nullif(v_endereco->>'id','')::uuid is not null then
        update public.pessoa_enderecos set
          tipo_endereco = v_endereco ->> 'tipo_endereco',
          logradouro    = v_endereco ->> 'logradouro',
          numero        = v_endereco ->> 'numero',
          complemento   = v_endereco ->> 'complemento',
          bairro        = v_endereco ->> 'bairro',
          cidade        = v_endereco ->> 'cidade',
          uf            = v_endereco ->> 'uf',
          cep           = v_endereco ->> 'cep',
          pais          = v_endereco ->> 'pais',
          updated_at    = now()
        where id = (v_endereco ->> 'id')::uuid
          and pessoa_id  = v_pessoa_id
          and empresa_id = v_empresa_id;
        v_endereco_ids_in_payload := array_append(v_endereco_ids_in_payload, (v_endereco ->> 'id')::uuid);
      else
        insert into public.pessoa_enderecos (
          id, empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento,
          bairro, cidade, uf, cep, pais
        )
        values (
          coalesce(nullif(v_endereco->>'id','')::uuid, gen_random_uuid()),
          v_empresa_id, v_pessoa_id,
          v_endereco ->> 'tipo_endereco',
          v_endereco ->> 'logradouro',
          v_endereco ->> 'numero',
          v_endereco ->> 'complemento',
          v_endereco ->> 'bairro',
          v_endereco ->> 'cidade',
          v_endereco ->> 'uf',
          v_endereco ->> 'cep',
          v_endereco ->> 'pais'
        );
      end if;
    end loop;

    -- Remove o que não veio no payload (replace set)
    delete from public.pessoa_enderecos
    where pessoa_id = v_pessoa_id
      and empresa_id = v_empresa_id
      and (cardinality(v_endereco_ids_in_payload) = 0 or id <> all(v_endereco_ids_in_payload));
  end if;

  -- Contatos (somente se o array foi enviado; semantics = "replace set")
  if v_has_contatos then
    for v_contato in
      select * from jsonb_array_elements(coalesce(v_contatos_payload, '[]'::jsonb))
    loop
      if nullif(v_contato->>'id','')::uuid is not null then
        update public.pessoa_contatos set
          nome        = v_contato ->> 'nome',
          email       = v_contato ->> 'email',
          telefone    = v_contato ->> 'telefone',
          cargo       = v_contato ->> 'cargo',
          observacoes = v_contato ->> 'observacoes',
          updated_at  = now()
        where id = (v_contato ->> 'id')::uuid
          and pessoa_id  = v_pessoa_id
          and empresa_id = v_empresa_id;
        v_contato_ids_in_payload := array_append(v_contato_ids_in_payload, (v_contato ->> 'id')::uuid);
      else
        insert into public.pessoa_contatos (
          id, empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes
        )
        values (
          coalesce(nullif(v_contato->>'id','')::uuid, gen_random_uuid()),
          v_empresa_id, v_pessoa_id,
          v_contato ->> 'nome',
          v_contato ->> 'email',
          v_contato ->> 'telefone',
          v_contato ->> 'cargo',
          v_contato ->> 'observacoes'
        );
      end if;
    end loop;

    -- Remove o que não veio no payload (replace set)
    delete from public.pessoa_contatos
    where pessoa_id = v_pessoa_id
      and empresa_id = v_empresa_id
      and (cardinality(v_contato_ids_in_payload) = 0 or id <> all(v_contato_ids_in_payload));
  end if;

  return public.get_partner_details(v_pessoa_id);
end;
$$;

-- 5) Delete (SECURITY DEFINER; escopo por empresa)
create or replace function public.delete_partner(p_id uuid)
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

  delete from public.pessoas
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Parceiro não encontrado ou não pertence à empresa.' using errcode = '23503';
  end if;
end;
$$;

-- 6) Permissões mínimas
revoke all on function public.list_partners(integer, integer, text, public.pessoa_tipo, text) from public, anon;
grant  execute on function public.list_partners(integer, integer, text, public.pessoa_tipo, text) to authenticated, service_role, postgres;

revoke all on function public.count_partners(text, public.pessoa_tipo) from public, anon;
grant  execute on function public.count_partners(text, public.pessoa_tipo) to authenticated, service_role, postgres;

revoke all on function public.get_partner_details(uuid) from public, anon;
grant  execute on function public.get_partner_details(uuid) to authenticated, service_role, postgres;

revoke all on function public.create_update_partner(jsonb) from public, anon;
grant  execute on function public.create_update_partner(jsonb) to authenticated, service_role, postgres;

revoke all on function public.delete_partner(uuid) from public, anon;
grant  execute on function public.delete_partner(uuid) to authenticated, service_role, postgres;
