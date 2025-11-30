/*
  # [MIGRATION] CRUD de Parceiros (Pessoas)
  Cria as RPCs para listagem, detalhamento e manipulação de parceiros (pessoas) e seus dados relacionados (endereços, contatos),
  seguindo os padrões de segurança do projeto.

  ## Detalhes:
  - `list_partners`: Lista parceiros com paginação, busca e filtro. SECURITY INVOKER para usar RLS.
  - `count_partners`: Conta o total de parceiros para paginação. SECURITY INVOKER.
  - `get_partner_details`: Retorna os dados completos de um parceiro, incluindo seus endereços e contatos. SECURITY INVOKER.
  - `create_update_partner`: Função transacional para criar ou atualizar um parceiro e seus endereços/contatos. SECURITY DEFINER para garantir consistência e segurança.
  - `delete_partner`: Remove um parceiro. SECURITY DEFINER.

  ## Segurança:
  - Funções `DEFINER` usam `current_empresa_id()` para garantir o isolamento de tenant.
  - Funções `INVOKER` dependem da RLS já aplicada nas tabelas.
  - Permissões mínimas são aplicadas (GRANT EXECUTE para `authenticated`).
*/

-- 1) Função de Listagem (para a tabela principal)
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
  select p.id, p.nome, p.tipo, p.doc_unico, p.email, p.created_at, p.updated_at
  from public.pessoas p
  -- RLS da tabela 'pessoas' é aplicada automaticamente aqui
  where (p_tipo is null or p.tipo = p_tipo)
    and (
      p_q is null
      or p.nome ilike '%' || p_q || '%'
      or p.doc_unico ilike '%' || p_q || '%'
      or p.email ilike '%' || p_q || '%'
    )
  order by
    case when lower(p_order) = 'nome asc'  then p.nome end asc nulls last,
    case when lower(p_order) = 'nome desc' then p.nome end desc nulls last,
    case when lower(p_order) = 'created_at asc'  then p.created_at end asc nulls last,
    case when lower(p_order) = 'created_at desc' then p.created_at end desc nulls last,
    p.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- 2) Função de Contagem (para paginação)
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

-- 3) Função para buscar detalhes de um parceiro (para o formulário de edição)
create or replace function public.get_partner_details(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select to_jsonb(p) || jsonb_build_object(
    'enderecos', (select coalesce(jsonb_agg(e), '[]'::jsonb) from public.pessoa_enderecos e where e.pessoa_id = p.id),
    'contatos', (select coalesce(jsonb_agg(c), '[]'::jsonb) from public.pessoa_contatos c where c.pessoa_id = p.id)
  )
  from public.pessoas p
  where p.id = p_id;
$$;

-- 4) Função de Criação e Atualização (transacional)
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_id uuid;
  v_pessoa_payload jsonb;
  v_enderecos_payload jsonb;
  v_contatos_payload jsonb;
  v_endereco jsonb;
  v_contato jsonb;
  v_endereco_ids_in_payload uuid[] := '{}';
  v_contato_ids_in_payload uuid[] := '{}';
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  v_pessoa_payload := p_payload -> 'pessoa';
  v_enderecos_payload := p_payload -> 'enderecos';
  v_contatos_payload := p_payload -> 'contatos';

  -- Upsert Pessoa
  v_pessoa_id := (v_pessoa_payload ->> 'id')::uuid;
  
  if v_pessoa_id is null then
    -- Create
    insert into public.pessoas (empresa_id, tipo, nome, doc_unico, email, telefone, inscr_estadual, isento_ie, inscr_municipal, observacoes)
    values (
      v_empresa_id,
      (v_pessoa_payload ->> 'tipo')::public.pessoa_tipo,
      v_pessoa_payload ->> 'nome',
      v_pessoa_payload ->> 'doc_unico',
      v_pessoa_payload ->> 'email',
      v_pessoa_payload ->> 'telefone',
      v_pessoa_payload ->> 'inscr_estadual',
      (v_pessoa_payload ->> 'isento_ie')::boolean,
      v_pessoa_payload ->> 'inscr_municipal',
      v_pessoa_payload ->> 'observacoes'
    ) returning id into v_pessoa_id;
  else
    -- Update
    update public.pessoas set
      tipo = (v_pessoa_payload ->> 'tipo')::public.pessoa_tipo,
      nome = v_pessoa_payload ->> 'nome',
      doc_unico = v_pessoa_payload ->> 'doc_unico',
      email = v_pessoa_payload ->> 'email',
      telefone = v_pessoa_payload ->> 'telefone',
      inscr_estadual = v_pessoa_payload ->> 'inscr_estadual',
      isento_ie = (v_pessoa_payload ->> 'isento_ie')::boolean,
      inscr_municipal = v_pessoa_payload ->> 'inscr_municipal',
      observacoes = v_pessoa_payload ->> 'observacoes',
      updated_at = now()
    where id = v_pessoa_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Parceiro não encontrado ou não pertence à empresa.' using errcode = '23503';
    end if;
  end if;

  -- Processar Endereços
  for v_endereco in select * from jsonb_array_elements(v_enderecos_payload)
  loop
    if v_endereco ->> 'id' is not null then
      update public.pessoa_enderecos set
        tipo_endereco = v_endereco ->> 'tipo_endereco',
        logradouro = v_endereco ->> 'logradouro',
        numero = v_endereco ->> 'numero',
        complemento = v_endereco ->> 'complemento',
        bairro = v_endereco ->> 'bairro',
        cidade = v_endereco ->> 'cidade',
        uf = v_endereco ->> 'uf',
        cep = v_endereco ->> 'cep',
        pais = v_endereco ->> 'pais',
        updated_at = now()
      where id = (v_endereco ->> 'id')::uuid and pessoa_id = v_pessoa_id;
      v_endereco_ids_in_payload := array_append(v_endereco_ids_in_payload, (v_endereco ->> 'id')::uuid);
    else
      insert into public.pessoa_enderecos (empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais)
      values (v_empresa_id, v_pessoa_id, v_endereco ->> 'tipo_endereco', v_endereco ->> 'logradouro', v_endereco ->> 'numero', v_endereco ->> 'complemento', v_endereco ->> 'bairro', v_endereco ->> 'cidade', v_endereco ->> 'uf', v_endereco ->> 'cep', v_endereco ->> 'pais');
    end if;
  end loop;
  
  -- Deletar endereços que não vieram no payload
  delete from public.pessoa_enderecos where pessoa_id = v_pessoa_id and id <> all(v_endereco_ids_in_payload);

  -- Processar Contatos
  for v_contato in select * from jsonb_array_elements(v_contatos_payload)
  loop
    if v_contato ->> 'id' is not null then
      update public.pessoa_contatos set
        nome = v_contato ->> 'nome',
        email = v_contato ->> 'email',
        telefone = v_contato ->> 'telefone',
        cargo = v_contato ->> 'cargo',
        observacoes = v_contato ->> 'observacoes',
        updated_at = now()
      where id = (v_contato ->> 'id')::uuid and pessoa_id = v_pessoa_id;
      v_contato_ids_in_payload := array_append(v_contato_ids_in_payload, (v_contato ->> 'id')::uuid);
    else
      insert into public.pessoa_contatos (empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes)
      values (v_empresa_id, v_pessoa_id, v_contato ->> 'nome', v_contato ->> 'email', v_contato ->> 'telefone', v_contato ->> 'cargo', v_contato ->> 'observacoes');
    end if;
  end loop;
  
  -- Deletar contatos que não vieram no payload
  delete from public.pessoa_contatos where pessoa_id = v_pessoa_id and id <> all(v_contato_ids_in_payload);

  return public.get_partner_details(v_pessoa_id);
end;
$$;

-- 5) Função de Deleção
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

  delete from public.pessoas where id = p_id and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Parceiro não encontrado ou não pertence à empresa.' using errcode = '23503';
  end if;
end;
$$;

-- 6) Permissões
revoke all on function public.list_partners(integer, integer, text, public.pessoa_tipo, text) from public, anon;
grant execute on function public.list_partners(integer, integer, text, public.pessoa_tipo, text) to authenticated;

revoke all on function public.count_partners(text, public.pessoa_tipo) from public, anon;
grant execute on function public.count_partners(text, public.pessoa_tipo) to authenticated;

revoke all on function public.get_partner_details(uuid) from public, anon;
grant execute on function public.get_partner_details(uuid) to authenticated;

revoke all on function public.create_update_partner(jsonb) from public, anon;
grant execute on function public.create_update_partner(jsonb) to authenticated;

revoke all on function public.delete_partner(uuid) from public, anon;
grant execute on function public.delete_partner(uuid) to authenticated;
