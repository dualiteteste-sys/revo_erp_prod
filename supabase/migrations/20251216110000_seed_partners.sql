/*
  ## Query Description
  Adiciona um índice único e duas RPCs de seed para a tabela `pessoas`:
  - `seed_partners_for_current_user()`: Insere 10 parceiros (clientes/fornecedores) na empresa do usuário atual (JWT).
  - `seed_partners_for_empresa(p_empresa_id)`: Variante admin para uso no SQL editor.

  Esta migração corrige uma tentativa anterior ao:
  1. Adicionar um índice único parcial em `(empresa_id, doc_unico)` para suportar a cláusula `ON CONFLICT`.
  2. Utilizar a coluna `doc_unico` existente na tabela `pessoas`, conforme a estrutura atual.

  Idempotente: Usa `CREATE UNIQUE INDEX IF NOT EXISTS` e `UPSERT` por `(empresa_id, doc_unico)`.

  ## Metadata
  - Schema-Category: ["Data", "Structural"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true] (basta deletar os 10 parceiros pelos seus CNPJs/CPFs)

  ## Structure Details
  - Adiciona `ix_pessoas_empresa_id_doc_unico_unique` em `public.pessoas`.
  - Insere 10 linhas na tabela `public.pessoas` com dados de exemplo.

  ## Security Implications
  - RLS permanece ativo.
  - RPCs são `SECURITY DEFINER` com `search_path` fixo.
  - A versão `seed_partners_for_empresa` só é executável por `service_role`.

  ## Performance Impact
  - Adiciona um índice, o que melhora a performance de buscas por `doc_unico`.
  - A inserção é pequena (10 linhas), sem impacto de performance.
*/

-- 1. Garantir o índice único parcial para a cláusula ON CONFLICT
-- Permite múltiplos nulos para doc_unico, mas garante unicidade quando preenchido.
CREATE UNIQUE INDEX IF NOT EXISTS ix_pessoas_empresa_id_doc_unico_unique ON public.pessoas (empresa_id, doc_unico) WHERE (doc_unico IS NOT NULL);

-- 2. Helper interno: realiza o upsert para um empresa_id informado
CREATE OR REPLACE FUNCTION public._seed_partners_for_empresa(p_empresa_id uuid)
RETURNS SETOF public.pessoas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION '[SEED][PARTNERS] empresa_id nulo' USING ERRCODE = '22004';
  END IF;

  WITH payload(tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone) AS (
    VALUES
      ('cliente', 'juridica'::public.tipo_pessoa_enum, 'Tecno Indústria Ltda', 'TecnoInd', '33041260000104', 'contato@tecnoind.com.br', '1140042025'),
      ('cliente', 'juridica'::public.tipo_pessoa_enum, 'Comércio Varejista Brasil S.A.', 'Varejo Brasil', '43834578000176', 'compras@varejobrasil.com', '2135008090'),
      ('fornecedor', 'juridica'::public.tipo_pessoa_enum, 'Distribuidora Alfa de Componentes', 'AlfaComp', '51323858000173', 'vendas@alfacomp.com', '4133334444'),
      ('fornecedor', 'juridica'::public.tipo_pessoa_enum, 'Logística Express Transportes', 'LogExpress', '22456789000112', 'comercial@logexpress.net', '5132009000'),
      ('ambos', 'juridica'::public.tipo_pessoa_enum, 'Serviços Gerais & Cia', 'SG Serviços', '89123456000199', 'sg@servicosgerais.com', '3134567890'),
      ('cliente', 'fisica'::public.tipo_pessoa_enum, 'Mariana Costa', NULL, '12345678901', 'mariana.costa@email.com', '11987654321'),
      ('cliente', 'fisica'::public.tipo_pessoa_enum, 'Carlos de Souza', NULL, '98765432109', 'carlos.souza@email.com', '21998765432'),
      ('fornecedor', 'fisica'::public.tipo_pessoa_enum, 'Fernanda Lima - Consultoria', NULL, '45678912300', 'fernanda.lima.consult@gmail.com', '48988776655'),
      ('ambos', 'fisica'::public.tipo_pessoa_enum, 'Rafael Oliveira Autônomo', NULL, '78912345601', 'rafa.oliveira@autonomo.com', '81987651234'),
      ('cliente', 'estrangeiro'::public.tipo_pessoa_enum, 'Global Exports Inc.', 'Global Exports', 'GE-998877', 'contact@globalexports.com', '15551234567')
  )
  INSERT INTO public.pessoas (
    empresa_id, tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone, contribuinte_icms
  )
  SELECT
    p_empresa_id,
    p.tipo::public.pessoa_tipo,
    p.tipo_pessoa,
    p.nome,
    p.fantasia,
    p.doc_unico,
    p.email,
    p.telefone,
    CASE WHEN p.tipo_pessoa = 'fisica' THEN '9'::public.contribuinte_icms_enum ELSE '1'::public.contribuinte_icms_enum END
  FROM payload p
  ON CONFLICT (empresa_id, doc_unico) WHERE doc_unico IS NOT NULL
  DO UPDATE SET
    tipo = EXCLUDED.tipo,
    tipo_pessoa = EXCLUDED.tipo_pessoa,
    nome = EXCLUDED.nome,
    fantasia = EXCLUDED.fantasia,
    email = EXCLUDED.email,
    telefone = EXCLUDED.telefone,
    updated_at = NOW();

  RETURN QUERY
    SELECT s.*
    FROM public.pessoas s
    WHERE s.empresa_id = p_empresa_id
      AND s.doc_unico IN ('33041260000104', '43834578000176', '51323858000173', '22456789000112', '89123456000199', '12345678901', '98765432109', '45678912300', '78912345601', 'GE-998877')
    ORDER BY s.nome;
END;
$$;

REVOKE ALL ON FUNCTION public._seed_partners_for_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._seed_partners_for_empresa(uuid) TO service_role;

-- 3. Versão ADMIN: seed por empresa_id (para uso no SQL editor)
CREATE OR REPLACE FUNCTION public.seed_partners_for_empresa(p_empresa_id uuid)
RETURNS SETOF public.pessoas
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT * FROM public._seed_partners_for_empresa(p_empresa_id);
$$;

REVOKE ALL ON FUNCTION public.seed_partners_for_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_partners_for_empresa(uuid) TO service_role;

-- 4. Versão USER: seed na empresa do usuário atual (JWT necessário)
CREATE OR REPLACE FUNCTION public.seed_partners_for_current_user()
RETURNS SETOF public.pessoas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[SEED][PARTNERS] empresa_id inválido para a sessão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public._seed_partners_for_empresa(v_emp);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_partners_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_partners_for_current_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_partners_for_current_user() TO service_role;
