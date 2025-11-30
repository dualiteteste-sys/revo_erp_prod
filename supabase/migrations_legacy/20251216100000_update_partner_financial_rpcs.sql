/*
# [RPC][PARCEIROS] Atualiza RPCs de parceiros para incluir campos financeiros
Este script atualiza as funções `create_update_partner` e `get_partner_details` para que possam salvar e retornar os novos campos financeiros (limite de crédito, condição de pagamento, informações bancárias) da tabela `pessoas`.

## Query Description:
- **create_update_partner**: A função é modificada para extrair os campos `limite_credito`, `condicao_pagamento` e `informacoes_bancarias` do payload JSON e incluí-los nas operações de INSERT e UPDATE na tabela `public.pessoas`.
- **get_partner_details**: A função é modificada para incluir os novos campos financeiros no `SELECT` principal, garantindo que eles sejam retornados ao carregar os detalhes de um parceiro.
Isso corrige o bug onde os dados financeiros não persistiam no formulário.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (revertendo para a versão anterior da função)

## Structure Details:
- Funções modificadas: `public.create_update_partner`, `public.get_partner_details`
- Campos afetados: `limite_credito`, `condicao_pagamento`, `informacoes_bancarias` na tabela `public.pessoas`.

## Security Implications:
- RLS Status: Inalterado. As funções continuam a operar sob as mesmas políticas de segurança.
- Policy Changes: Não
- Auth Requirements: `authenticated`

## Performance Impact:
- Indexes: Nenhum
- Triggers: Nenhum
- Estimated Impact: Mínimo. Apenas adiciona campos ao payload e ao resultado.
*/

-- [RPC][PARCEIROS] create_update_partner
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
  v_pessoa_data jsonb := p_payload -> 'pessoa';
  v_enderecos_data jsonb := p_payload -> 'enderecos';
  v_contatos_data jsonb := p_payload -> 'contatos';
  v_result jsonb;
  v_endereco jsonb;
  v_contato jsonb;
  v_limite_credito numeric;
begin
  -- 1. Get active company and check authorization
  select uae.empresa_id into v_empresa_id
  from public.user_active_empresa uae
  where uae.user_id = v_uid
  limit 1;

  if v_empresa_id is null then
    raise insufficient_privilege using message = '[AUTH] usuário sem empresa ativa';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] não é membro da empresa ativa';
  end if;

  -- Validate financial fields
  v_limite_credito := nullif(v_pessoa_data ->> 'limite_credito', '')::numeric;
  if v_limite_credito < 0 then
    raise invalid_parameter_value using message = 'Limite de crédito não pode ser negativo.';
  end if;

  -- 2. Upsert pessoa
  if v_pessoa_data ? 'id' and jsonb_typeof(v_pessoa_data -> 'id') != 'null' then
    v_pessoa_id := (v_pessoa_data ->> 'id')::uuid;
    update public.pessoas p set
      tipo = (v_pessoa_data ->> 'tipo')::pessoa_tipo,
      nome = v_pessoa_data ->> 'nome',
      doc_unico = v_pessoa_data ->> 'doc_unico',
      email = v_pessoa_data ->> 'email',
      telefone = v_pessoa_data ->> 'telefone',
      celular = v_pessoa_data ->> 'celular',
      site = v_pessoa_data ->> 'site',
      inscr_estadual = v_pessoa_data ->> 'inscr_estadual',
      isento_ie = (v_pessoa_data ->> 'isento_ie')::boolean,
      inscr_municipal = v_pessoa_data ->> 'inscr_municipal',
      observacoes = v_pessoa_data ->> 'observacoes',
      tipo_pessoa = (v_pessoa_data ->> 'tipo_pessoa')::tipo_pessoa_enum,
      fantasia = v_pessoa_data ->> 'fantasia',
      codigo_externo = v_pessoa_data ->> 'codigo_externo',
      contribuinte_icms = (v_pessoa_data ->> 'contribuinte_icms')::contribuinte_icms_enum,
      contato_tags = (select jsonb_agg(value) from jsonb_array_elements_text(v_pessoa_data -> 'contato_tags')),
      limite_credito = v_limite_credito,
      condicao_pagamento = v_pessoa_data ->> 'condicao_pagamento',
      informacoes_bancarias = v_pessoa_data ->> 'informacoes_bancarias'
    where p.id = v_pessoa_id;
  else
    insert into public.pessoas (
      empresa_id, tipo, nome, doc_unico, email, telefone, celular, site, inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa, fantasia, codigo_externo, contribuinte_icms, contato_tags, limite_credito, condicao_pagamento, informacoes_bancarias
    ) values (
      v_empresa_id,
      (v_pessoa_data ->> 'tipo')::pessoa_tipo,
      v_pessoa_data ->> 'nome',
      v_pessoa_data ->> 'doc_unico',
      v_pessoa_data ->> 'email',
      v_pessoa_data ->> 'telefone',
      v_pessoa_data ->> 'celular',
      v_pessoa_data ->> 'site',
      v_pessoa_data ->> 'inscr_estadual',
      (v_pessoa_data ->> 'isento_ie')::boolean,
      v_pessoa_data ->> 'inscr_municipal',
      v_pessoa_data ->> 'observacoes',
      (v_pessoa_data ->> 'tipo_pessoa')::tipo_pessoa_enum,
      v_pessoa_data ->> 'fantasia',
      v_pessoa_data ->> 'codigo_externo',
      (v_pessoa_data ->> 'contribuinte_icms')::contribuinte_icms_enum,
      (select jsonb_agg(value) from jsonb_array_elements_text(v_pessoa_data -> 'contato_tags')),
      v_limite_credito,
      v_pessoa_data ->> 'condicao_pagamento',
      v_pessoa_data ->> 'informacoes_bancarias'
    ) returning id into v_pessoa_id;
  end if;

  -- 3. Upsert endereços
  if v_enderecos_data is not null and jsonb_array_length(v_enderecos_data) > 0 then
    -- Clear old addresses
    delete from public.pessoa_enderecos where pessoa_id = v_pessoa_id;
    -- Insert new ones
    for v_endereco in select * from jsonb_array_elements(v_enderecos_data) loop
      insert into public.pessoa_enderecos (pessoa_id, empresa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
      values (v_pessoa_id, v_empresa_id, (v_endereco ->> 'tipo_endereco'), v_endereco ->> 'logradouro', v_endereco ->> 'numero', v_endereco ->> 'complemento', v_endereco ->> 'bairro', v_endereco ->> 'cidade', v_endereco ->> 'uf', v_endereco ->> 'cep', v_endereco ->> 'pais');
    end loop;
  end if;

  -- 4. Upsert contatos
  if v_contatos_data is not null and jsonb_array_length(v_contatos_data) > 0 then
    -- Clear old contacts
    delete from public.pessoa_contatos where pessoa_id = v_pessoa_id;
    -- Insert new ones
    for v_contato in select * from jsonb_array_elements(v_contatos_data) loop
      insert into public.pessoa_contatos (pessoa_id, empresa_id, nome, cargo, email, telefone, observacoes)
      values (v_pessoa_id, v_empresa_id, v_contato ->> 'nome', v_contato ->> 'cargo', v_contato ->> 'email', v_contato ->> 'telefone', v_contato ->> 'observacoes');
    end loop;
  end if;

  -- 5. Return full details
  select public.get_partner_details(v_pessoa_id) into v_result;
  return v_result;
end;
$$;

grant execute on function public.create_update_partner(jsonb) to authenticated;


-- [RPC][PARCEIROS] get_partner_details
create or replace function public.get_partner_details(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
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
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'tipo_pessoa', p.tipo_pessoa,
    'fantasia', p.fantasia,
    'codigo_externo', p.codigo_externo,
    'contribuinte_icms', p.contribuinte_icms,
    'contato_tags', p.contato_tags,
    'limite_credito', p.limite_credito,
    'condicao_pagamento', p.condicao_pagamento,
    'informacoes_bancarias', p.informacoes_bancarias,
    'enderecos', (
      select coalesce(jsonb_agg(pe order by pe.created_at), '[]'::jsonb)
      from public.pessoa_enderecos pe
      where pe.pessoa_id = p.id
    ),
    'contatos', (
      select coalesce(jsonb_agg(pc order by pc.created_at), '[]'::jsonb)
      from public.pessoa_contatos pc
      where pc.pessoa_id = p.id
    )
  )
  from public.pessoas p
  where p.id = p_id;
$$;

grant execute on function public.get_partner_details(uuid) to authenticated;
