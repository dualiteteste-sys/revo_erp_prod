-- [RPC FIX] create_update_partner/_create_update_partner — keep inserted enderecos/contatos (and preserve wrapper pattern)
-- Why: some environments use RBAC wrappers where `create_update_partner` delegates to `_create_update_partner`.
-- This migration ensures BOTH functions are correct, so inserts into `pessoa_enderecos`/`pessoa_contatos` are not deleted.

create or replace function public._create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_id uuid;
  v_pessoa jsonb := coalesce(p_payload->'pessoa','{}'::jsonb);
  v_enderecos jsonb := p_payload->'enderecos';
  v_contatos jsonb := p_payload->'contatos';
  v_endereco jsonb;
  v_contato jsonb;
  v_endereco_ids uuid[] := '{}';
  v_contato_ids uuid[] := '{}';
  v_new_endereco_id uuid;
  v_new_contato_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  v_pessoa_id := nullif(v_pessoa->>'id','')::uuid;

  if v_pessoa_id is null then
    insert into public.pessoas (
      empresa_id, tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone, celular, site,
      inscr_estadual, isento_ie, inscr_municipal, observacoes, codigo_externo, contribuinte_icms, contato_tags,
      limite_credito, condicao_pagamento, informacoes_bancarias, deleted_at
    ) values (
      v_empresa_id,
      coalesce(nullif(v_pessoa->>'tipo','')::public.pessoa_tipo, 'cliente'::public.pessoa_tipo),
      coalesce(nullif(v_pessoa->>'tipo_pessoa','')::public.tipo_pessoa_enum, 'juridica'::public.tipo_pessoa_enum),
      nullif(v_pessoa->>'nome',''),
      nullif(v_pessoa->>'fantasia',''),
      nullif(v_pessoa->>'doc_unico',''),
      nullif(v_pessoa->>'email',''),
      nullif(v_pessoa->>'telefone',''),
      nullif(v_pessoa->>'celular',''),
      nullif(v_pessoa->>'site',''),
      nullif(v_pessoa->>'inscr_estadual',''),
      coalesce(nullif(v_pessoa->>'isento_ie','')::boolean, false),
      nullif(v_pessoa->>'inscr_municipal',''),
      nullif(v_pessoa->>'observacoes',''),
      nullif(v_pessoa->>'codigo_externo',''),
      coalesce(nullif(v_pessoa->>'contribuinte_icms','')::public.contribuinte_icms_enum, '9'::public.contribuinte_icms_enum),
      case when jsonb_typeof(v_pessoa->'contato_tags') = 'array'
        then array(select jsonb_array_elements_text(v_pessoa->'contato_tags'))
        else null
      end,
      nullif(v_pessoa->>'limite_credito','')::numeric,
      nullif(v_pessoa->>'condicao_pagamento',''),
      nullif(v_pessoa->>'informacoes_bancarias',''),
      null
    ) returning id into v_pessoa_id;
  else
    update public.pessoas set
      tipo = coalesce(nullif(v_pessoa->>'tipo','')::public.pessoa_tipo, tipo),
      tipo_pessoa = coalesce(nullif(v_pessoa->>'tipo_pessoa','')::public.tipo_pessoa_enum, tipo_pessoa),
      nome = nullif(v_pessoa->>'nome',''),
      fantasia = nullif(v_pessoa->>'fantasia',''),
      doc_unico = nullif(v_pessoa->>'doc_unico',''),
      email = nullif(v_pessoa->>'email',''),
      telefone = nullif(v_pessoa->>'telefone',''),
      celular = nullif(v_pessoa->>'celular',''),
      site = nullif(v_pessoa->>'site',''),
      inscr_estadual = nullif(v_pessoa->>'inscr_estadual',''),
      isento_ie = coalesce(nullif(v_pessoa->>'isento_ie','')::boolean, false),
      inscr_municipal = nullif(v_pessoa->>'inscr_municipal',''),
      observacoes = nullif(v_pessoa->>'observacoes',''),
      codigo_externo = nullif(v_pessoa->>'codigo_externo',''),
      contribuinte_icms = coalesce(nullif(v_pessoa->>'contribuinte_icms','')::public.contribuinte_icms_enum, '9'::public.contribuinte_icms_enum),
      contato_tags = case when jsonb_typeof(v_pessoa->'contato_tags') = 'array'
        then array(select jsonb_array_elements_text(v_pessoa->'contato_tags'))
        else contato_tags
      end,
      limite_credito = nullif(v_pessoa->>'limite_credito','')::numeric,
      condicao_pagamento = nullif(v_pessoa->>'condicao_pagamento',''),
      informacoes_bancarias = nullif(v_pessoa->>'informacoes_bancarias',''),
      deleted_at = null
    where id = v_pessoa_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Parceiro nao encontrado ou fora da empresa.' using errcode = '23503';
    end if;
  end if;

  -- Enderecos: replace set semantics only if payload is array
  if jsonb_typeof(v_enderecos) = 'array' then
    for v_endereco in select * from jsonb_array_elements(v_enderecos)
    loop
      if nullif(v_endereco->>'id','') is not null then
        update public.pessoa_enderecos set
          tipo_endereco = coalesce(nullif(v_endereco->>'tipo_endereco',''), tipo_endereco),
          logradouro = nullif(v_endereco->>'logradouro',''),
          numero = nullif(v_endereco->>'numero',''),
          complemento = nullif(v_endereco->>'complemento',''),
          bairro = nullif(v_endereco->>'bairro',''),
          cidade = nullif(v_endereco->>'cidade',''),
          uf = nullif(v_endereco->>'uf',''),
          cep = nullif(v_endereco->>'cep',''),
          pais = nullif(v_endereco->>'pais',''),
          cidade_codigo = nullif(v_endereco->>'cidade_codigo',''),
          pais_codigo = nullif(v_endereco->>'pais_codigo','')
        where id = (v_endereco->>'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_endereco_ids := array_append(v_endereco_ids, (v_endereco->>'id')::uuid);
      else
        insert into public.pessoa_enderecos (
          empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais, cidade_codigo, pais_codigo
        ) values (
          v_empresa_id, v_pessoa_id,
          coalesce(nullif(v_endereco->>'tipo_endereco',''), 'PRINCIPAL'),
          nullif(v_endereco->>'logradouro',''),
          nullif(v_endereco->>'numero',''),
          nullif(v_endereco->>'complemento',''),
          nullif(v_endereco->>'bairro',''),
          nullif(v_endereco->>'cidade',''),
          nullif(v_endereco->>'uf',''),
          nullif(v_endereco->>'cep',''),
          nullif(v_endereco->>'pais',''),
          nullif(v_endereco->>'cidade_codigo',''),
          coalesce(nullif(v_endereco->>'pais_codigo',''), '1058')
        )
        returning id into v_new_endereco_id;

        v_endereco_ids := array_append(v_endereco_ids, v_new_endereco_id);
      end if;
    end loop;

    delete from public.pessoa_enderecos
    where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id
      and (array_length(v_endereco_ids, 1) is null or id <> all(v_endereco_ids));
  end if;

  -- Contatos: replace set semantics only if payload is array
  if jsonb_typeof(v_contatos) = 'array' then
    for v_contato in select * from jsonb_array_elements(v_contatos)
    loop
      if nullif(v_contato->>'id','') is not null then
        update public.pessoa_contatos set
          nome = nullif(v_contato->>'nome',''),
          email = nullif(v_contato->>'email',''),
          telefone = nullif(v_contato->>'telefone',''),
          cargo = nullif(v_contato->>'cargo',''),
          observacoes = nullif(v_contato->>'observacoes','')
        where id = (v_contato->>'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_contato_ids := array_append(v_contato_ids, (v_contato->>'id')::uuid);
      else
        insert into public.pessoa_contatos (
          empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes
        ) values (
          v_empresa_id, v_pessoa_id,
          nullif(v_contato->>'nome',''),
          nullif(v_contato->>'email',''),
          nullif(v_contato->>'telefone',''),
          nullif(v_contato->>'cargo',''),
          nullif(v_contato->>'observacoes','')
        )
        returning id into v_new_contato_id;

        v_contato_ids := array_append(v_contato_ids, v_new_contato_id);
      end if;
    end loop;

    delete from public.pessoa_contatos
    where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id
      and (array_length(v_contato_ids, 1) is null or id <> all(v_contato_ids));
  end if;

  return public.get_partner_details(v_pessoa_id);
end;
$$;

-- Keep the public entrypoint as an invoker wrapper (RBAC-friendly)
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select public._create_update_partner(p_payload);
$$;

revoke all on function public._create_update_partner(jsonb) from public, anon;
grant execute on function public._create_update_partner(jsonb) to authenticated, service_role;

revoke all on function public.create_update_partner(jsonb) from public, anon;
grant execute on function public.create_update_partner(jsonb) to authenticated, service_role;

