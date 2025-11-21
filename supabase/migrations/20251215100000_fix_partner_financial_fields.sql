-- [RPC][PARCEIROS] Recria as funções de CRUD para incluir campos financeiros

-- Remove a função antiga que busca detalhes para evitar erro de tipo de retorno
drop function if exists public.get_partner_details(uuid);

-- Remove a função antiga de criar/atualizar
drop function if exists public.create_update_partner(jsonb);

-- Recria a função de buscar detalhes, agora incluindo os campos financeiros
create or replace function public.get_partner_details(p_id uuid)
returns table (
    id uuid,
    empresa_id uuid,
    tipo pessoa_tipo,
    nome text,
    doc_unico text,
    email text,
    telefone text,
    inscr_estadual text,
    isento_ie boolean,
    inscr_municipal text,
    observacoes text,
    created_at timestamptz,
    updated_at timestamptz,
    pessoa_search tsvector,
    tipo_pessoa tipo_pessoa_enum,
    fantasia text,
    codigo_externo text,
    contribuinte_icms contribuinte_icms_enum,
    contato_tags text[],
    celular text,
    site text,
    limite_credito numeric,
    condicao_pagamento text,
    informacoes_bancarias text,
    enderecos jsonb,
    contatos jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_user_member_of((select p.empresa_id from public.pessoas p where p.id = p_id)) then
    raise insufficient_privilege using message = 'Acesso negado a este parceiro.';
  end if;

  return query
  with p_enderecos as (
    select
      p_id as pessoa_id,
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'tipo_endereco', e.tipo_endereco,
          'logradouro', e.logradouro,
          'numero', e.numero,
          'complemento', e.complemento,
          'bairro', e.bairro,
          'cidade', e.cidade,
          'uf', e.uf,
          'cep', e.cep,
          'pais', e.pais
        )
      ) as enderecos
    from public.pessoa_enderecos e
    where e.pessoa_id = p_id
  ),
  p_contatos as (
    select
      p_id as pessoa_id,
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'nome', c.nome,
          'email', c.email,
          'telefone', c.telefone,
          'cargo', c.cargo,
          'observacoes', c.observacoes
        )
      ) as contatos
    from public.pessoa_contatos c
    where c.pessoa_id = p_id
  )
  select
    p.*,
    pe.enderecos,
    pc.contatos
  from public.pessoas p
  left join p_enderecos pe on p.id = pe.pessoa_id
  left join p_contatos pc on p.id = pc.pessoa_id
  where p.id = p_id;
end;
$$;

-- Recria a função de criar/atualizar, agora incluindo os campos financeiros
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_payload jsonb := p_payload -> 'pessoa';
  v_pessoa_id uuid;
  v_enderecos_payload jsonb := p_payload -> 'enderecos';
  v_contatos_payload jsonb := p_payload -> 'contatos';
  v_end jsonb;
  v_cont jsonb;
  v_result jsonb;
begin
  if v_empresa_id is null then
    raise insufficient_privilege using message = '[AUTH] Empresa não selecionada.';
  end if;

  v_pessoa_id := (v_pessoa_payload ->> 'id')::uuid;

  if v_pessoa_id is null then
    -- Create
    insert into public.pessoas (
      empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual, isento_ie,
      inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo, contribuinte_icms, contato_tags,
      celular, site, limite_credito, condicao_pagamento, informacoes_bancarias
    )
    values (
      v_empresa_id,
      (v_pessoa_payload ->> 'tipo')::pessoa_tipo,
      v_pessoa_payload ->> 'nome',
      v_pessoa_payload ->> 'doc_unico',
      v_pessoa_payload ->> 'email',
      v_pessoa_payload ->> 'telefone',
      v_pessoa_payload ->> 'inscr_estadual',
      (v_pessoa_payload ->> 'isento_ie')::boolean,
      v_pessoa_payload ->> 'inscr_municipal',
      v_pessoa_payload ->> 'observacoes',
      (v_pessoa_payload ->> 'tipo_pessoa')::tipo_pessoa_enum,
      v_pessoa_payload ->> 'fantasia',
      v_pessoa_payload ->> 'codigo_externo',
      (v_pessoa_payload ->> 'contribuinte_icms')::contribuinte_icms_enum,
      (select array_agg(trim(elem::text, '"')) from jsonb_array_elements_text(v_pessoa_payload -> 'contato_tags')),
      v_pessoa_payload ->> 'celular',
      v_pessoa_payload ->> 'site',
      (v_pessoa_payload ->> 'limite_credito')::numeric,
      v_pessoa_payload ->> 'condicao_pagamento',
      v_pessoa_payload ->> 'informacoes_bancarias'
    )
    returning id into v_pessoa_id;
  else
    -- Update
    if not public.is_user_member_of((select p.empresa_id from public.pessoas p where p.id = v_pessoa_id)) then
      raise insufficient_privilege using message = 'Acesso negado a este parceiro.';
    end if;

    update public.pessoas
    set
      tipo = (v_pessoa_payload ->> 'tipo')::pessoa_tipo,
      nome = v_pessoa_payload ->> 'nome',
      doc_unico = v_pessoa_payload ->> 'doc_unico',
      email = v_pessoa_payload ->> 'email',
      telefone = v_pessoa_payload ->> 'telefone',
      inscr_estadual = v_pessoa_payload ->> 'inscr_estadual',
      isento_ie = (v_pessoa_payload ->> 'isento_ie')::boolean,
      inscr_municipal = v_pessoa_payload ->> 'inscr_municipal',
      observacoes = v_pessoa_payload ->> 'observacoes',
      tipo_pessoa = (v_pessoa_payload ->> 'tipo_pessoa')::tipo_pessoa_enum,
      fantasia = v_pessoa_payload ->> 'fantasia',
      codigo_externo = v_pessoa_payload ->> 'codigo_externo',
      contribuinte_icms = (v_pessoa_payload ->> 'contribuinte_icms')::contribuinte_icms_enum,
      contato_tags = (select array_agg(trim(elem::text, '"')) from jsonb_array_elements_text(v_pessoa_payload -> 'contato_tags')),
      celular = v_pessoa_payload ->> 'celular',
      site = v_pessoa_payload ->> 'site',
      limite_credito = (v_pessoa_payload ->> 'limite_credito')::numeric,
      condicao_pagamento = v_pessoa_payload ->> 'condicao_pagamento',
      informacoes_bancarias = v_pessoa_payload ->> 'informacoes_bancarias'
    where id = v_pessoa_id;
  end if;

  -- Endereços
  delete from public.pessoa_enderecos where pessoa_id = v_pessoa_id;
  if jsonb_array_length(v_enderecos_payload) > 0 then
    for v_end in select * from jsonb_array_elements(v_enderecos_payload) loop
      insert into public.pessoa_enderecos (pessoa_id, empresa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
      values (v_pessoa_id, v_empresa_id, v_end ->> 'tipo_endereco', v_end ->> 'logradouro', v_end ->> 'numero', v_end ->> 'complemento', v_end ->> 'bairro', v_end ->> 'cidade', v_end ->> 'uf', v_end ->> 'cep', v_end ->> 'pais');
    end loop;
  end if;

  -- Contatos
  delete from public.pessoa_contatos where pessoa_id = v_pessoa_id;
  if jsonb_array_length(v_contatos_payload) > 0 then
    for v_cont in select * from jsonb_array_elements(v_contatos_payload) loop
      insert into public.pessoa_contatos (pessoa_id, empresa_id, nome, email, telefone, cargo, observacoes)
      values (v_pessoa_id, v_empresa_id, v_cont ->> 'nome', v_cont ->> 'email', v_cont ->> 'telefone', v_cont ->> 'cargo', v_cont ->> 'observacoes');
    end loop;
  end if;

  select to_jsonb(r) into v_result from public.get_partner_details(v_pessoa_id) r;
  return v_result;
end;
$$;

grant execute on function public.get_partner_details(uuid) to authenticated;
grant execute on function public.create_update_partner(jsonb) to authenticated;
