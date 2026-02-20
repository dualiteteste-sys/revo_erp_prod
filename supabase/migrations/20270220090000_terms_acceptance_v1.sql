/*
  TERMS — Mandatory acceptance gate (v1.0) per empresa_id (multi-tenant)

  Goals
  - Force acceptance on first login AFTER empresa_id is resolved.
  - Persist an auditable record per (empresa_id, user_id, terms_key, terms_version).
  - Fail-closed if tenant header is missing/ambiguous.
*/

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Canonical terms document storage (source-of-truth for UI + hash integrity).
CREATE TABLE IF NOT EXISTS public.terms_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version text NOT NULL,
  body text NOT NULL,
  body_sha256 text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'terms_documents_key_version_uniq'
  ) THEN
    ALTER TABLE public.terms_documents
      ADD CONSTRAINT terms_documents_key_version_uniq UNIQUE (key, version);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS terms_documents_current_per_key_uniq
  ON public.terms_documents (key)
  WHERE is_current;

ALTER TABLE public.terms_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terms_documents_read_all ON public.terms_documents;
CREATE POLICY terms_documents_read_all
  ON public.terms_documents
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.terms_documents TO authenticated, service_role;

-- Insert Terms v1.0 only if missing (idempotent).
WITH src AS (
  SELECT
    'ultria_erp_terms'::text AS key,
    '1.0'::text AS version,
    $terms$
Termos de Aceite Versão: 1.0
Data de criação: Data do aceite
Ao contratar, acessar ou utilizar o Ultria ERP, o CLIENTE declara que leu, compreendeu e concorda integralmente com os termos e condições abaixo.

1. DEFINIÇÕES E ESCOPO DO SERVIÇO
Ultria ERP: plataforma SaaS de gestão empresarial.
Cliente: pessoa física ou jurídica contratante.
Serviço: acesso conforme plano contratado no site ultria.com.br.
O Cliente declara ter ciência da tabela de planos e módulos antes da contratação.

2. LICENÇA DE USO
Licença limitada, não exclusiva, intransferível e para uso interno.
É proibida engenharia reversa, redistribuição, criação de sistemas derivados e violação de controles de acesso.
Integrações via API são permitidas dentro dos limites contratuais.

3. OBRIGAÇÕES E RESPONSABILIDADES DO CLIENTE
O Cliente é responsável pelos dados inseridos, inclusive fiscais e contábeis.
A Ultria ERP não se responsabiliza por erros decorrentes de dados incorretos.

4. PAGAMENTO, PLANOS E CANCELAMENTO
Cobrança mensal ou anual.
Cancelamento pelo painel do sistema.
Acesso até o final do período pago.
30 dias para exportação de dados (CSV/XLS).
Após 30 dias, dados excluídos.
Suporte de exportação pode ser contratado à parte.

5. SUPORTE E ATENDIMENTO
Suporte padrão via ticket e e-mail.
Atendimento de segunda a sexta, 8h às 18h (pausa 12h às 13h15).
Sem atendimento em finais de semana e feriados.
Suporte Premium (WhatsApp e telefone) mediante contratação.

6. PRIVACIDADE E LGPD
Cliente é Controlador; Ultria ERP é Operador.
Medidas de segurança adotadas.
Notificação de incidentes.
Subprocessadores podem ser utilizados.
Exportação e exclusão conforme cláusula 4.

7. SLA
Disponibilidade de 99% mensal.
Manutenções e falhas de terceiros não caracterizam descumprimento.

8. LIMITAÇÃO DE RESPONSABILIDADE
Limite de responsabilidade: valores pagos nos últimos 12 meses.
Sem responsabilidade por danos indiretos.

9. ALTERAÇÕES DOS TERMOS
Alterações podem ocorrer com publicação de nova versão.

10. LEI E FORO
Leis da República Federativa do Brasil e Lei de Proteção de Dados LGPD.
Foro: Foro de Osasco do Estado de São Paulo .

11. DISPOSIÇÕES GERAIS
Cláusulas independentes.
Este termo constitui o acordo integral entre as partes.
$terms$::text AS body
),
ins AS (
  INSERT INTO public.terms_documents (key, version, body, body_sha256, is_current)
  SELECT
    s.key,
    s.version,
    s.body,
    encode(digest(s.body, 'sha256'), 'hex') AS body_sha256,
    true AS is_current
  FROM src s
  ON CONFLICT (key, version) DO NOTHING
  RETURNING 1
)
SELECT 1;

-- Ensure v1.0 is marked current (idempotent).
UPDATE public.terms_documents
SET is_current = (version = '1.0')
WHERE key = 'ultria_erp_terms';

-- 2) Acceptance records (tenant-scoped, auditable).
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_document_id uuid NOT NULL REFERENCES public.terms_documents(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  origin text NULL,
  user_agent text NULL,
  document_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'terms_acceptances_uniq'
  ) THEN
    ALTER TABLE public.terms_acceptances
      ADD CONSTRAINT terms_acceptances_uniq UNIQUE (empresa_id, user_id, terms_document_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS terms_acceptances_empresa_user_idx
  ON public.terms_acceptances (empresa_id, user_id, accepted_at DESC);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terms_acceptances_select_own ON public.terms_acceptances;
CREATE POLICY terms_acceptances_select_own
  ON public.terms_acceptances
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS terms_acceptances_insert_own ON public.terms_acceptances;
CREATE POLICY terms_acceptances_insert_own
  ON public.terms_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND user_id = auth.uid()
  );

GRANT SELECT, INSERT ON TABLE public.terms_acceptances TO authenticated, service_role;

-- 3) RPCs (RPC-first): read current document + check acceptance + accept

CREATE OR REPLACE FUNCTION public.terms_document_current_get(p_key text)
RETURNS TABLE (
  key text,
  version text,
  body text,
  body_sha256 text
)
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT d.key, d.version, d.body, d.body_sha256
  FROM public.terms_documents d
  WHERE d.key = p_key
    AND d.is_current = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.terms_document_current_get(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terms_acceptance_status_get(p_key text)
RETURNS TABLE (
  is_accepted boolean,
  acceptance_id uuid,
  accepted_at timestamptz,
  version text,
  document_sha256 text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_headers json;
  v_header_val text;
  v_header_emp uuid;
  v_emp uuid := public.current_empresa_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'terms_acceptance_status_get: not_authenticated';
  END IF;

  -- Fail-closed: do not allow accepting/checking terms without explicit tenant header.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_header_val := v_headers ->> 'x-empresa-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_val := NULL;
  END;

  IF v_header_val IS NULL THEN
    RAISE EXCEPTION 'terms_acceptance_status_get: missing_x_empresa_id';
  END IF;

  BEGIN
    v_header_emp := v_header_val::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_header_emp := NULL;
  END;

  IF v_header_emp IS NULL OR v_emp IS NULL OR v_header_emp <> v_emp THEN
    RAISE EXCEPTION 'terms_acceptance_status_get: tenant_mismatch';
  END IF;

  RETURN QUERY
  WITH doc AS (
    SELECT d.id, d.version, d.body_sha256
    FROM public.terms_documents d
    WHERE d.key = p_key AND d.is_current = true
    LIMIT 1
  ),
  acc AS (
    SELECT a.id, a.accepted_at
    FROM public.terms_acceptances a
    JOIN doc ON doc.id = a.terms_document_id
    WHERE a.empresa_id = v_emp AND a.user_id = auth.uid()
    LIMIT 1
  )
  SELECT
    (acc.id IS NOT NULL) AS is_accepted,
    acc.id AS acceptance_id,
    acc.accepted_at,
    doc.version,
    doc.body_sha256
  FROM doc
  LEFT JOIN acc ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.terms_acceptance_status_get(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terms_accept_current(
  p_key text,
  p_origin text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  acceptance_id uuid,
  accepted_at timestamptz,
  version text,
  document_sha256 text
)
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_headers json;
  v_header_val text;
  v_header_emp uuid;
  v_emp uuid := public.current_empresa_id();
  v_doc_id uuid;
  v_doc_version text;
  v_doc_sha text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'terms_accept_current: not_authenticated';
  END IF;

  -- Fail-closed: require explicit tenant header.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_header_val := v_headers ->> 'x-empresa-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_val := NULL;
  END;

  IF v_header_val IS NULL THEN
    RAISE EXCEPTION 'terms_accept_current: missing_x_empresa_id';
  END IF;

  BEGIN
    v_header_emp := v_header_val::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_header_emp := NULL;
  END;

  IF v_header_emp IS NULL OR v_emp IS NULL OR v_header_emp <> v_emp THEN
    RAISE EXCEPTION 'terms_accept_current: tenant_mismatch';
  END IF;

  SELECT d.id, d.version, d.body_sha256
  INTO v_doc_id, v_doc_version, v_doc_sha
  FROM public.terms_documents d
  WHERE d.key = p_key AND d.is_current = true
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'terms_accept_current: missing_terms_document';
  END IF;

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.terms_acceptances (
      empresa_id,
      user_id,
      terms_document_id,
      accepted_at,
      origin,
      user_agent,
      document_sha256
    )
    VALUES (
      v_emp,
      auth.uid(),
      v_doc_id,
      now(),
      nullif(trim(coalesce(p_origin, '')), ''),
      nullif(trim(coalesce(p_user_agent, '')), ''),
      v_doc_sha
    )
    ON CONFLICT (empresa_id, user_id, terms_document_id) DO UPDATE
      SET accepted_at = public.terms_acceptances.accepted_at
    RETURNING id, accepted_at
  )
  SELECT upserted.id, upserted.accepted_at, v_doc_version, v_doc_sha
  FROM upserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.terms_accept_current(text, text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

