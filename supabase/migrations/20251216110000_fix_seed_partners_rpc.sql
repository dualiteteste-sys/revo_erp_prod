/*
  ## Query Description
  Corrige a funcionalidade de seed de parceiros, garantindo a conformidade com as regras do projeto.
  - Adiciona o índice UNIQUE parcial necessário em `(empresa_id, doc_unico)`.
  - Corrige a função de seed para usar o `ON CONFLICT` corretamente com o novo índice.
  - Mantém a consistência com o schema da tabela `pessoas` que utiliza a coluna `doc_unico`.

  ## Metadata
  - Schema-Category: ["Structural", "Data"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true] (basta executar DROP INDEX e DROP FUNCTION)

  ## Structure Details
  - Adiciona `UNIQUE INDEX idx_pessoas_empresa_id_doc_unico_not_null` na tabela `public.pessoas`.
  - Recria as funções `_seed_partners_for_empresa`, `seed_partners_for_empresa`, e `seed_partners_for_current_user`.

  ## Security Implications
  - Nenhuma. As funções seguem o padrão `SECURITY DEFINER` e `search_path` seguro.

  ## Performance Impact
  - A criação do índice pode causar um breve lock na tabela `pessoas`, mas o impacto é mínimo em tabelas de tamanho moderado. A inserção de dados é pequena.
*/

-- 1. Garantir o índice UNIQUE parcial para o ON CONFLICT
-- Este índice permite a existência de múltiplos nulos, mas garante unicidade para valores não nulos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_empresa_id_doc_unico_not_null ON public.pessoas (empresa_id, doc_unico) WHERE doc_unico IS NOT NULL;

-- 2. Recriar a função helper interna com a lógica de UPSERT correta
create or replace function public._seed_partners_for_empresa(p_empresa_id uuid)
returns setof public.pessoas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_empresa_id is null then
    raise exception '[SEED][PARTNERS] empresa_id nulo' using errcode='22004';
  end if;

  -- Lista de parceiros (nome, tipo, tipo_pessoa, doc_unico, email, telefone)
  with payload(nome, tipo, tipo_pessoa, doc_unico, email, telefone) as (
    values
      ('Empresa de Tecnologia Exemplo Ltda', 'ambos', 'juridica', '01234567000101', 'contato@tecnologiaexemplo.com', '1122223333'),
      ('Fornecedor de Componentes S.A.', 'fornecedor', 'juridica', '98765432000199', 'vendas@componentes.com.br', '4133334444'),
      ('João da Silva (Cliente)', 'cliente', 'fisica', '11122233344', 'joao.silva@emailpessoal.com', '2199998888'),
      ('Maria Oliveira (Cliente)', 'cliente', 'fisica', '55566677788', 'maria.oliveira@emailpessoal.com', '3198887777'),
      ('Consultoria ABC EIRELI', 'fornecedor', 'juridica', '12312312000112', 'consultoria@abc.com', '5130304040'),
      ('Supermercado Preço Bom', 'cliente', 'juridica', '45645645000145', 'compras@precobom.net', '8134345656'),
      ('Ana Costa (Fornecedora)', 'fornecedor', 'fisica', '99988877766', 'ana.costa.freelancer@email.com', '7197776666'),
      ('Oficina Mecânica Rápida', 'ambos', 'juridica', '78978978000178', 'oficina@mecanicarapida.com.br', '6132324545'),
      ('Restaurante Sabor Divino', 'cliente', 'juridica', '10101010000110', 'gerencia@sabordivino.com', '9135356767'),
      ('Pedro Martins (Cliente)', 'cliente', 'fisica', '44455566677', 'pedro.martins@email.com', '8596665555')
  )
  insert into public.pessoas (
    empresa_id, nome, tipo, tipo_pessoa, doc_unico, email, telefone, contribuinte_icms, isento_ie
  )
  select
    p_empresa_id,
    p.nome,
    p.tipo::public.pessoa_tipo,
    p.tipo_pessoa::public.tipo_pessoa_enum,
    p.doc_unico,
    p.email,
    p.telefone,
    '9', -- Default: Não Contribuinte
    false
  from payload p
  on conflict (empresa_id, doc_unico) where doc_unico is not null
  do update set
    nome             = excluded.nome,
    tipo             = excluded.tipo,
    tipo_pessoa      = excluded.tipo_pessoa,
    email            = excluded.email,
    telefone         = excluded.telefone,
    updated_at       = now();

  return query
    select s.*
    from public.pessoas s
    where s.empresa_id = p_empresa_id
      and s.doc_unico in ('01234567000101', '98765432000199', '11122233344', '55566677788', '12312312000112', '45645645000145', '99988877766', '78978978000178', '10101010000110', '44455566677')
    order by s.nome;
end;
$$;

-- 3. Recriar as funções públicas que dependem da helper
-- Permissões são mantidas pela sintaxe `create or replace`

-- Helper interno
revoke all on function public._seed_partners_for_empresa(uuid) from public;
grant execute on function public._seed_partners_for_empresa(uuid) to service_role;

-- Versão ADMIN: seed por empresa_id (utilizar no SQL editor, sem JWT)
create or replace function public.seed_partners_for_empresa(p_empresa_id uuid)
returns setof public.pessoas
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select * from public._seed_partners_for_empresa(p_empresa_id);
$$;

revoke all on function public.seed_partners_for_empresa(uuid) from public;
grant execute on function public.seed_partners_for_empresa(uuid) to service_role;

-- Versão USER: seed na empresa do usuário atual (JWT necessário)
create or replace function public.seed_partners_for_current_user()
returns setof public.pessoas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[SEED][PARTNERS] empresa_id inválido para a sessão' using errcode='42501';
  end if;

  return query select * from public._seed_partners_for_empresa(v_emp);
end;
$$;

revoke all on function public.seed_partners_for_current_user() from public;
grant execute on function public.seed_partners_for_current_user() to authenticated;
grant execute on function public.seed_partners_for_current_user() to service_role;
