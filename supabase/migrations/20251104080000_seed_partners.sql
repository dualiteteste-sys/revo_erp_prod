-- Seed: 10 parceiros (clientes/fornecedores) padrão
/*
  ## Query Description
  Adiciona RPCs para popular a tabela `pessoas` com 10 parceiros de exemplo.
  - `seed_partners_for_current_user()`: Insere 10 parceiros na empresa do usuário logado (via JWT).
  - `seed_partners_for_empresa(p_empresa_id)`: Versão para administradores, executável no editor SQL.

  É idempotente, usando `INSERT ... ON CONFLICT` na `(empresa_id, doc_unico)` para evitar duplicatas.

  ## Metadata
  - Schema-Category: ["Data"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true] (Basta deletar os registros com os CNPJs/CPFs de exemplo)

  ## Structure Details
  - Alvo: `public.pessoas`
  - Ação: Insere 10 registros com dados fictícios.

  ## Security Implications
  - RLS da tabela `pessoas` é respeitada.
  - RPCs são `SECURITY DEFINER` com `search_path` fixo.
  - `seed_partners_for_empresa` é restrita a `service_role`.

  ## Performance Impact
  - Inserção de 10 linhas. Impacto desprezível.
*/

-- Helper interno
create or replace function public._seed_partners_for_empresa(p_empresa_id uuid)
returns setof public.pessoas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_empresa_id is null then
    raise exception '[SEED][PARCEIROS] empresa_id nulo' using errcode='22004';
  end if;

  with payload(tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone, contribuinte_icms) as (
    values
      ('cliente', 'fisica', 'Ana Silva', null, '11122233344', 'ana.silva@email.com', '11987654321', '9'),
      ('cliente', 'fisica', 'Bruno Costa', null, '22233344455', 'bruno.costa@email.com', '21987654322', '9'),
      ('cliente', 'fisica', 'Carla Dias', null, '33344455566', 'carla.dias@email.com', '31987654323', '9'),
      ('cliente', 'fisica', 'Daniel Faria', null, '44455566677', 'daniel.faria@email.com', '41987654324', '9'),
      ('cliente', 'fisica', 'Elisa Gomes', null, '55566677788', 'elisa.gomes@email.com', '51987654325', '9'),
      ('fornecedor', 'juridica', 'Fornecedora de Componentes SA', 'Componentes SA', '11222333000144', 'contato@componentessa.com', '1140041234', '1'),
      ('fornecedor', 'juridica', 'Insumos Industriais Ltda', 'Insumos Inc.', '22333444000155', 'vendas@insumosinc.com', '2140042345', '1'),
      ('fornecedor', 'juridica', 'Matéria Prima Global', 'MP Global', '33444555000166', 'compras@mpglobal.com', '3140043456', '1'),
      ('ambos', 'juridica', 'Soluções Integradas & Cia', 'Soluções & Cia', '44555666000177', 'parceria@solucoescia.com', '4140044567', '2'),
      ('ambos', 'juridica', 'Parceiro Comercial Total Ltda', 'Parceiro Total', '55666777000188', 'contato@parceirototal.com', '5140045678', '9')
  )
  insert into public.pessoas (
    empresa_id, tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone, contribuinte_icms
  )
  select
    p_empresa_id,
    p.tipo::public.pessoa_tipo,
    p.tipo_pessoa::public.tipo_pessoa_enum,
    p.nome,
    p.fantasia,
    p.doc_unico,
    p.email,
    p.telefone,
    p.contribuinte_icms::public.contribuinte_icms_enum
  from payload p
  on conflict (empresa_id, doc_unico) where doc_unico is not null
  do update set
    tipo = excluded.tipo,
    tipo_pessoa = excluded.tipo_pessoa,
    nome = excluded.nome,
    fantasia = excluded.fantasia,
    email = excluded.email,
    telefone = excluded.telefone,
    contribuinte_icms = excluded.contribuinte_icms,
    updated_at = now();

  return query
    select *
    from public.pessoas s
    where s.empresa_id = p_empresa_id
      and s.doc_unico in (
        '11122233344', '22233344455', '33344455566', '44455566677', '55566677788',
        '11222333000144', '22333444000155', '33444555000166', '44555666000177', '55666777000188'
      )
    order by s.nome;
end;
$$;

revoke all on function public._seed_partners_for_empresa(uuid) from public;
grant execute on function public._seed_partners_for_empresa(uuid) to service_role;

-- Versão ADMIN: seed por empresa_id
create or replace function public.seed_partners_for_empresa(p_empresa_id uuid)
returns setof public.pessoas
language sql security definer set search_path = pg_catalog, public stable
as $$
  select * from public._seed_partners_for_empresa(p_empresa_id)
$$;

revoke all on function public.seed_partners_for_empresa(uuid) from public;
grant execute on function public.seed_partners_for_empresa(uuid) to service_role;

-- Versão USER: seed na empresa do usuário atual
create or replace function public.seed_partners_for_current_user()
returns setof public.pessoas
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[SEED][PARCEIROS] empresa_id inválido para a sessão' using errcode='42501';
  end if;

  return query select * from public._seed_partners_for_empresa(v_emp);
end;
$$;

revoke all on function public.seed_partners_for_current_user() from public;
grant execute on function public.seed_partners_for_current_user() to authenticated;
grant execute on function public.seed_partners_for_current_user() to service_role;
