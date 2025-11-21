/*
# [RPC][PARCEIROS] Atualizar RPCs para persistir dados financeiros
[Descrição da Operação]
Esta migração atualiza as funções `create_update_partner` e `get_partner_details` para incluir os campos financeiros: `limite_credito`, `condicao_pagamento` e `informacoes_bancarias`. Isso garante que os dados inseridos no formulário sejam corretamente salvos e recuperados do banco de dados.

## Query Description:
- **Impacto:** As funções de criação, atualização e leitura de parceiros serão substituídas. Não há impacto em dados existentes, mas a partir da aplicação, os novos campos financeiros passarão a ser persistidos.
- **Riscos:** Baixo. A alteração é aditiva e não modifica a estrutura de dados existente.
- **Precauções:** Nenhuma.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (reaplicando a versão anterior da função)

## Structure Details:
- Funções afetadas: `public.create_update_partner`, `public.get_partner_details`.
- Campos adicionados à lógica: `limite_credito`, `condicao_pagamento`, `informacoes_bancarias`.

## Security Implications:
- RLS Status: Inalterado. As funções continuam a operar sob as mesmas políticas de segurança.
- Policy Changes: No.
- Auth Requirements: `authenticated`.

## Performance Impact:
- Indexes: Nenhum.
- Triggers: Nenhum.
- Estimated Impact: Nenhum impacto de performance esperado.
*/

-- [RPC][PARCEIROS] create_update_partner
create or replace function public.create_update_partner(p_payload json)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pessoa_id uuid;
  v_empresa_id uuid;
  v_pessoa_payload jsonb;
  v_enderecos_payload jsonb;
  v_contatos_payload jsonb;
  v_result json;
begin
  -- Obter empresa_id da sessão
  v_empresa_id := public.current_empresa_id();
  if v_empresa_id is null then
    raise insufficient_privilege using message = '[AUTH] Empresa ativa não definida na sessão.';
  end if;

  v_pessoa_payload := (p_payload->>'pessoa')::jsonb;
  v_enderecos_payload := (p_payload->>'enderecos')::jsonb;
  v_contatos_payload := (p_payload->>'contatos')::jsonb;

  -- Upsert da pessoa
  insert into public.pessoas (
    id, empresa_id, tipo, nome, fantasia, doc_unico, email, telefone, celular, site,
    inscr_estadual, isento_ie, inscr_municipal, observacoes, tipo_pessoa,
    codigo_externo, contribuinte_icms, contato_tags,
    limite_credito, condicao_pagamento, informacoes_bancarias
  )
  values (
    coalesce((v_pessoa_payload->>'id')::uuid, gen_random_uuid()),
    v_empresa_id,
    (v_pessoa_payload->>'tipo')::pessoa_tipo,
    v_pessoa_payload->>'nome',
    v_pessoa_payload->>'fantasia',
    v_pessoa_payload->>'doc_unico',
    v_pessoa_payload->>'email',
    v_pessoa_payload->>'telefone',
    v_pessoa_payload->>'celular',
    v_pessoa_payload->>'site',
    v_pessoa_payload->>'inscr_estadual',
    (v_pessoa_payload->>'isento_ie')::boolean,
    v_pessoa_payload->>'inscr_municipal',
    v_pessoa_payload->>'observacoes',
    (v_pessoa_payload->>'tipo_pessoa')::tipo_pessoa_enum,
    v_pessoa_payload->>'codigo_externo',
    (v_pessoa_payload->>'contribuinte_icms')::contribuinte_icms_enum,
    (select array_agg(value) from jsonb_array_elements_text(v_pessoa_payload->'contato_tags')),
    (v_pessoa_payload->>'limite_credito')::numeric,
    v_pessoa_payload->>'condicao_pagamento',
    v_pessoa_payload->>'informacoes_bancarias'
  )
  on conflict (id) do update set
    tipo = excluded.tipo,
    nome = excluded.nome,
    fantasia = excluded.fantasia,
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
    codigo_externo = excluded.codigo_externo,
    contribuinte_icms = excluded.contribuinte_icms,
    contato_tags = excluded.contato_tags,
    limite_credito = excluded.limite_credito,
    condicao_pagamento = excluded.condicao_pagamento,
    informacoes_bancarias = excluded.informacoes_bancarias
  returning id into v_pessoa_id;

  -- Gerenciar endereços
  if v_enderecos_payload is not null then
    -- Remover endereços que não estão no payload
    delete from public.pessoa_enderecos pe
    where pe.pessoa_id = v_pessoa_id
      and pe.id not in (select (e->>'id')::uuid from jsonb_array_elements(v_enderecos_payload) as e where e->>'id' is not null);

    -- Upsert de endereços
    insert into public.pessoa_enderecos (id, pessoa_id, empresa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
    select
      coalesce((e->>'id')::uuid, gen_random_uuid()),
      v_pessoa_id,
      v_empresa_id,
      (e->>'tipo_endereco')::text,
      e->>'logradouro',
      e->>'numero',
      e->>'complemento',
      e->>'bairro',
      e->>'cidade',
      e->>'uf',
      e->>'cep',
      coalesce(e->>'pais', 'Brasil')
    from jsonb_array_elements(v_enderecos_payload) as e
    on conflict (id) do update set
      tipo_endereco = excluded.tipo_endereco,
      logradouro = excluded.logradouro,
      numero = excluded.numero,
      complemento = excluded.complemento,
      bairro = excluded.bairro,
      cidade = excluded.cidade,
      uf = excluded.uf,
      cep = excluded.cep,
      pais = excluded.pais;
  end if;

  -- Gerenciar contatos
  if v_contatos_payload is not null then
    -- Remover contatos que não estão no payload
    delete from public.pessoa_contatos pc
    where pc.pessoa_id = v_pessoa_id
      and pc.id not in (select (c->>'id')::uuid from jsonb_array_elements(v_contatos_payload) as c where c->>'id' is not null);
      
    -- Upsert de contatos
    insert into public.pessoa_contatos (id, pessoa_id, empresa_id, nome, email, telefone, cargo, observacoes)
    select
      coalesce((c->>'id')::uuid, gen_random_uuid()),
      v_pessoa_id,
      v_empresa_id,
      c->>'nome',
      c->>'email',
      c->>'telefone',
      c->>'cargo',
      c->>'observacoes'
    from jsonb_array_elements(v_contatos_payload) as c
    on conflict (id) do update set
      nome = excluded.nome,
      email = excluded.email,
      telefone = excluded.telefone,
      cargo = excluded.cargo,
      observacoes = excluded.observacoes;
  end if;

  -- Retornar os detalhes completos
  select public.get_partner_details(v_pessoa_id) into v_result;
  return v_result;
end;
$$;

grant execute on function public.create_update_partner(json) to authenticated;

-- [RPC][PARCEIROS] get_partner_details
create or replace function public.get_partner_details(p_id uuid)
returns json
language sql
security definer
set search_path = pg_catalog, public
as $$
  select json_build_object(
    'id', p.id,
    'empresa_id', p.empresa_id,
    'tipo', p.tipo,
    'nome', p.nome,
    'fantasia', p.fantasia,
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
    'codigo_externo', p.codigo_externo,
    'contribuinte_icms', p.contribuinte_icms,
    'contato_tags', p.contato_tags,
    'limite_credito', p.limite_credito,
    'condicao_pagamento', p.condicao_pagamento,
    'informacoes_bancarias', p.informacoes_bancarias,
    'enderecos', (
      select coalesce(json_agg(pe.*), '[]'::json)
      from public.pessoa_enderecos pe
      where pe.pessoa_id = p.id
    ),
    'contatos', (
      select coalesce(json_agg(pc.*), '[]'::json)
      from public.pessoa_contatos pc
      where pc.pessoa_id = p.id
    )
  )
  from public.pessoas p
  where p.id = p_id and p.empresa_id = public.current_empresa_id();
$$;

grant execute on function public.get_partner_details(uuid) to authenticated;
