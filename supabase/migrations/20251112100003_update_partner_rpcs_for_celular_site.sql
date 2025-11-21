-- [RPC][PARTNERS] create_update_partner (com celular/site)
/*
# [Operation Name]
Atualizar a função 'create_update_partner' para incluir 'celular' e 'site'.

## Query Description: [This operation replaces the existing `create_update_partner` function to support creating and updating the new `celular` and `site` fields for a partner. It modifies the function to extract these fields from the JSONB payload and include them in the `INSERT` and `UPDATE` logic. This change is backward-compatible.]

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Function: public.create_update_partner(p_payload jsonb)
- Changes:
  - Extracts 'celular' and 'site' from the payload.
  - Adds 'celular' and 'site' to the `INSERT` statement.
  - Adds 'celular' and 'site' to the `ON CONFLICT ... DO UPDATE` clause.

## Security Implications:
- RLS Status: Not applicable (Function is SECURITY DEFINER).
- Policy Changes: No.
- Auth Requirements: The function maintains its `SECURITY DEFINER` status and internal authorization checks.

## Performance Impact:
- Indexes: None.
- Triggers: None.
- Estimated Impact: Negligible.
*/
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_empresa_id uuid;
  v_pessoa_id uuid;
  v_tipo pessoa_tipo;
  v_nome text;
  v_doc_unico text;
  v_email text;
  v_telefone text;
  v_celular text;
  v_site text;
  v_inscr_estadual text;
  v_isento_ie boolean;
  v_inscr_municipal text;
  v_observacoes text;
  v_tipo_pessoa tipo_pessoa_enum;
  v_fantasia text;
  v_codigo_externo text;
  v_contribuinte_icms contribuinte_icms_enum;
  v_contato_tags text[];
  v_enderecos jsonb;
  v_contatos jsonb;
  v_endereco jsonb;
  v_contato jsonb;
begin
  -- Validação de sessão e empresa
  select eu.empresa_id into v_empresa_id
  from public.empresa_usuarios eu
  where eu.user_id = v_uid
  limit 1;

  if v_empresa_id is null then
    raise insufficient_privilege using message = '[AUTH] Usuário sem empresa associada.';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] Usuário não é membro da empresa.';
  end if;

  -- Extrair dados da pessoa
  v_pessoa_id := coalesce((p_payload->'pessoa'->>'id')::uuid, gen_random_uuid());
  v_tipo := (p_payload->'pessoa'->>'tipo')::pessoa_tipo;
  v_nome := p_payload->'pessoa'->>'nome';
  v_doc_unico := p_payload->'pessoa'->>'doc_unico';
  v_email := p_payload->'pessoa'->>'email';
  v_telefone := p_payload->'pessoa'->>'telefone';
  v_celular := p_payload->'pessoa'->>'celular';
  v_site := p_payload->'pessoa'->>'site';
  v_inscr_estadual := p_payload->'pessoa'->>'inscr_estadual';
  v_isento_ie := (p_payload->'pessoa'->>'isento_ie')::boolean;
  v_inscr_municipal := p_payload->'pessoa'->>'inscr_municipal';
  v_observacoes := p_payload->'pessoa'->>'observacoes';
  v_tipo_pessoa := (p_payload->'pessoa'->>'tipo_pessoa')::tipo_pessoa_enum;
  v_fantasia := p_payload->'pessoa'->>'fantasia';
  v_codigo_externo := p_payload->'pessoa'->>'codigo_externo';
  v_contribuinte_icms := (p_payload->'pessoa'->>'contribuinte_icms')::contribuinte_icms_enum;
  v_contato_tags := ARRAY(SELECT jsonb_array_elements_text(p_payload->'pessoa'->'contato_tags'));

  -- Inserir/Atualizar pessoa
  insert into public.pessoas (
    id, empresa_id, tipo, nome, doc_unico, email, telefone, celular, site,
    inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa,
    fantasia, codigo_externo, contribuinte_icms, contato_tags
  )
  values (
    v_pessoa_id, v_empresa_id, v_tipo, v_nome, v_doc_unico, v_email, v_telefone, v_celular, v_site,
    v_inscr_estadual, v_isento_ie, v_inscr_municipal, v_observacoes, v_tipo_pessoa,
    v_fantasia, v_codigo_externo, v_contribuinte_icms, v_contato_tags
  )
  on conflict (id) do update set
    tipo = excluded.tipo,
    nome = excluded.nome,
    doc_unico = excluded.doc_unico,
    email = excluded.email,
    telefone = excluded.telefone,
    celular = excluded.celular,
    site = excluded.site,
    inscr_estadual = excluded.inscr_estadual,
    isento_ie = excluded.isento_ie,
    inscr_municipal = excluded.inscr_municipal,
    observacoes = excluded.observacoes,
    tipo_pessoa = excluded.tipo_pessoa,
    fantasia = excluded.fantasia,
    codigo_externo = excluded.codigo_externo,
    contribuinte_icms = excluded.contribuinte_icms,
    contato_tags = excluded.contato_tags,
    updated_at = now();

  -- Processar endereços
  v_enderecos := p_payload->'enderecos';
  if jsonb_typeof(v_enderecos) = 'array' then
    -- Remover endereços que não estão no payload
    delete from public.pessoa_enderecos
    where pessoa_id = v_pessoa_id
      and id not in (select (value->>'id')::uuid from jsonb_array_elements(v_enderecos) where value->>'id' is not null);

    -- Inserir/Atualizar endereços
    for v_endereco in select * from jsonb_array_elements(v_enderecos) loop
      insert into public.pessoa_enderecos (
        id, pessoa_id, empresa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais
      )
      values (
        coalesce((v_endereco->>'id')::uuid, gen_random_uuid()),
        v_pessoa_id, v_empresa_id,
        v_endereco->>'tipo_endereco', v_endereco->>'logradouro', v_endereco->>'numero',
        v_endereco->>'complemento', v_endereco->>'bairro', v_endereco->>'cidade',
        v_endereco->>'uf', v_endereco->>'cep', v_endereco->>'pais'
      )
      on conflict (id) do update set
        tipo_endereco = excluded.tipo_endereco,
        logradouro = excluded.logradouro,
        numero = excluded.numero,
        complemento = excluded.complemento,
        bairro = excluded.bairro,
        cidade = excluded.cidade,
        uf = excluded.uf,
        cep = excluded.cep,
        pais = excluded.pais,
        updated_at = now();
    end loop;
  end if;

  -- Processar contatos
  v_contatos := p_payload->'contatos';
  if jsonb_typeof(v_contatos) = 'array' then
    -- Remover contatos que não estão no payload
    delete from public.pessoa_contatos
    where pessoa_id = v_pessoa_id
      and id not in (select (value->>'id')::uuid from jsonb_array_elements(v_contatos) where value->>'id' is not null);

    -- Inserir/Atualizar contatos
    for v_contato in select * from jsonb_array_elements(v_contatos) loop
      insert into public.pessoa_contatos (
        id, pessoa_id, empresa_id, nome, email, telefone, cargo, observacoes
      )
      values (
        coalesce((v_contato->>'id')::uuid, gen_random_uuid()),
        v_pessoa_id, v_empresa_id,
        v_contato->>'nome', v_contato->>'email', v_contato->>'telefone',
        v_contato->>'cargo', v_contato->>'observacoes'
      )
      on conflict (id) do update set
        nome = excluded.nome,
        email = excluded.email,
        telefone = excluded.telefone,
        cargo = excluded.cargo,
        observacoes = excluded.observacoes,
        updated_at = now();
    end loop;
  end if;

  -- Retornar detalhes completos
  return public.get_partner_details(v_pessoa_id);
end;
$$;

revoke execute on function public.create_update_partner(jsonb) from public;
grant execute on function public.create_update_partner(jsonb) to authenticated;

-- [RPC][PARTNERS] get_partner_details (com celular/site)
/*
# [Operation Name]
Atualizar a função 'get_partner_details' para retornar 'celular' e 'site'.

## Query Description: [This operation replaces the existing `get_partner_details` function to include the new `celular` and `site` fields in the returned JSONB object. This ensures that the frontend receives the complete partner information after a create or update operation.]

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Function: public.get_partner_details(p_id uuid)
- Changes:
  - Adds 'celular' and 'site' to the `jsonb_build_object` call.

## Security Implications:
- RLS Status: Not applicable (Function is SECURITY INVOKER).
- Policy Changes: No.
- Auth Requirements: Access is governed by the RLS policies on the `public.pessoas` table.

## Performance Impact:
- Indexes: None.
- Triggers: None.
- Estimated Impact: Negligível.
*/
create or replace function public.get_partner_details(p_id uuid)
returns jsonb
language plpgsql
security invoker -- Usa RLS da tabela 'pessoas'
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  select
    jsonb_strip_nulls(jsonb_build_object(
      'id', p.id,
      'empresa_id', p.empresa_id,
      'tipo', p.tipo,
      'nome', p.nome,
      'doc_unico', p.doc_unico,
      'email', p.email,
      'telefone', p.telefone,
      'celular', p.celular,
      'site', p.site,
      'inscr_estadual', p.inscr_estadual,
      'isento_ie', p.isento_ie,
      'inscr_municipal', p.inscr_municipal,
      'observacoes', p.observacoes,
      'tipo_pessoa', p.tipo_pessoa,
      'fantasia', p.fantasia,
      'codigo_externo', p.codigo_externo,
      'contribuinte_icms', p.contribuinte_icms,
      'contato_tags', p.contato_tags,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'enderecos', (
        select coalesce(jsonb_agg(e order by e.created_at), '[]'::jsonb)
        from public.pessoa_enderecos e where e.pessoa_id = p.id
      ),
      'contatos', (
        select coalesce(jsonb_agg(c order by c.created_at), '[]'::jsonb)
        from public.pessoa_contatos c where c.pessoa_id = p.id
      )
    ))
  into v_result
  from public.pessoas p
  where p.id = p_id;

  if v_result is null then
    raise exception 'NOT_FOUND: Parceiro com id % não encontrado.', p_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.get_partner_details(uuid) from public;
grant execute on function public.get_partner_details(uuid) to authenticated;
