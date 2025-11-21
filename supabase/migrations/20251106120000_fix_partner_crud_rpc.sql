-- Migration: Corrige a RPC de salvar parceiros para ser mais robusta
-- Causa do erro: a função não tratava corretamente payloads onde as listas de endereços/contatos estavam ausentes.
-- Correção:
--  - Adiciona verificações `jsonb_typeof` para garantir que os loops só executem sobre arrays.
--  - Garante que todos os novos campos (rg, celular, site, etc.) sejam incluídos no insert/update.
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
  v_enderecos_payload jsonb := p_payload -> 'enderecos';
  v_contatos_payload  jsonb := p_payload -> 'contatos';
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

  v_pessoa_id := nullif(v_pessoa_payload ->> 'id','')::uuid;

  if v_pessoa_id is null then
    insert into public.pessoas (
      empresa_id, tipo, nome, doc_unico, email, telefone, celular, site,
      inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa,
      fantasia, codigo_externo, contribuinte_icms, contato_tags, rg, carteira_habilitacao
    )
    values (
      v_empresa_id,
      nullif(v_pessoa_payload->>'tipo','')::public.pessoa_tipo,
      v_pessoa_payload ->> 'nome',
      nullif(v_pessoa_payload ->> 'doc_unico',''),
      nullif(v_pessoa_payload ->> 'email',''),
      nullif(v_pessoa_payload ->> 'telefone',''),
      nullif(v_pessoa_payload ->> 'celular',''),
      nullif(v_pessoa_payload ->> 'site',''),
      nullif(v_pessoa_payload ->> 'inscr_estadual',''),
      nullif(v_pessoa_payload ->> 'isento_ie','')::boolean,
      nullif(v_pessoa_payload ->> 'inscr_municipal',''),
      nullif(v_pessoa_payload ->> 'observacoes',''),
      nullif(v_pessoa_payload->>'tipo_pessoa','')::public.tipo_pessoa_enum,
      nullif(v_pessoa_payload->>'fantasia',''),
      nullif(v_pessoa_payload->>'codigo_externo',''),
      nullif(v_pessoa_payload->>'contribuinte_icms','')::public.contribuinte_icms_enum,
      (select array_agg(elem) from jsonb_array_elements_text(v_pessoa_payload->'contato_tags') as elem),
      nullif(v_pessoa_payload->>'rg',''),
      nullif(v_pessoa_payload->>'carteira_habilitacao','')
    )
    returning id into v_pessoa_id;
  else
    update public.pessoas set
      tipo = coalesce(nullif(v_pessoa_payload->>'tipo','')::public.pessoa_tipo, tipo),
      nome = coalesce(v_pessoa_payload->>'nome', nome),
      doc_unico = coalesce(nullif(v_pessoa_payload->>'doc_unico',''), doc_unico),
      email = coalesce(nullif(v_pessoa_payload->>'email',''), email),
      telefone = coalesce(nullif(v_pessoa_payload->>'telefone',''), telefone),
      celular = coalesce(nullif(v_pessoa_payload->>'celular',''), celular),
      site = coalesce(nullif(v_pessoa_payload->>'site',''), site),
      inscr_estadual = coalesce(nullif(v_pessoa_payload->>'inscr_estadual',''), inscr_estadual),
      isento_ie = coalesce(nullif(v_pessoa_payload->>'isento_ie','')::boolean, isento_ie),
      inscr_municipal = coalesce(nullif(v_pessoa_payload->>'inscr_municipal',''), inscr_municipal),
      observacoes = coalesce(nullif(v_pessoa_payload->>'observacoes',''), observacoes),
      tipo_pessoa = coalesce(nullif(v_pessoa_payload->>'tipo_pessoa','')::public.tipo_pessoa_enum, tipo_pessoa),
      fantasia = coalesce(nullif(v_pessoa_payload->>'fantasia',''), fantasia),
      codigo_externo = coalesce(nullif(v_pessoa_payload->>'codigo_externo',''), codigo_externo),
      contribuinte_icms = coalesce(nullif(v_pessoa_payload->>'contribuinte_icms','')::public.contribuinte_icms_enum, contribuinte_icms),
      contato_tags = coalesce((select array_agg(elem) from jsonb_array_elements_text(v_pessoa_payload->'contato_tags') as elem), contato_tags),
      rg = coalesce(nullif(v_pessoa_payload->>'rg',''), rg),
      carteira_habilitacao = coalesce(nullif(v_pessoa_payload->>'carteira_habilitacao',''), carteira_habilitacao),
      updated_at = now()
    where id = v_pessoa_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Parceiro não encontrado ou não pertence à empresa.' using errcode = '23503';
    end if;
  end if;

  if v_has_enderecos then
    for v_endereco in select * from jsonb_array_elements(coalesce(v_enderecos_payload, '[]'::jsonb)) loop
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
        where id = (v_endereco ->> 'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_endereco_ids_in_payload := array_append(v_endereco_ids_in_payload, (v_endereco ->> 'id')::uuid);
      else
        insert into public.pessoa_enderecos (id, empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
        values (
          coalesce(nullif(v_endereco->>'id','')::uuid, gen_random_uuid()),
          v_empresa_id, v_pessoa_id, v_endereco ->> 'tipo_endereco', v_endereco ->> 'logradouro', v_endereco ->> 'numero',
          v_endereco ->> 'complemento', v_endereco ->> 'bairro', v_endereco ->> 'cidade', v_endereco ->> 'uf', v_endereco ->> 'cep', v_endereco ->> 'pais'
        );
      end if;
    end loop;
    delete from public.pessoa_enderecos where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id and (cardinality(v_endereco_ids_in_payload) = 0 or id <> all(v_endereco_ids_in_payload));
  end if;

  if v_has_contatos then
    for v_contato in select * from jsonb_array_elements(coalesce(v_contatos_payload, '[]'::jsonb)) loop
      if nullif(v_contato->>'id','')::uuid is not null then
        update public.pessoa_contatos set
          nome = v_contato ->> 'nome', email = v_contato ->> 'email', telefone = v_contato ->> 'telefone',
          cargo = v_contato ->> 'cargo', observacoes = v_contato ->> 'observacoes', updated_at  = now()
        where id = (v_contato ->> 'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_contato_ids_in_payload := array_append(v_contato_ids_in_payload, (v_contato ->> 'id')::uuid);
      else
        insert into public.pessoa_contatos (id, empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes)
        values (
          coalesce(nullif(v_contato->>'id','')::uuid, gen_random_uuid()),
          v_empresa_id, v_pessoa_id, v_contato ->> 'nome', v_contato ->> 'email', v_contato ->> 'telefone', v_contato ->> 'cargo', v_contato ->> 'observacoes'
        );
      end if;
    end loop;
    delete from public.pessoa_contatos where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id and (cardinality(v_contato_ids_in_payload) = 0 or id <> all(v_contato_ids_in_payload));
  end if;

  return public.get_partner_details(v_pessoa_id);
end;
$$;
