/*
  Serviços (OS): anexos reais (arquivos) via Storage + tabela de metadados + RPCs.

  - Bucket: os_docs (privado)
  - Path padrão: <empresa_id>/os/<os_id>/<filename>
  - Tabela: public.os_docs
  - RPCs: os_docs_list / os_doc_register / os_doc_delete
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Bucket e políticas (apenas se o schema storage existir)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('os_docs', 'os_docs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Read OS Docs" ON storage.objects;
  CREATE POLICY "Read OS Docs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'os_docs'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );

  DROP POLICY IF EXISTS "Write OS Docs" ON storage.objects;
  CREATE POLICY "Write OS Docs"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'os_docs'
      AND auth.role() = 'authenticated'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );

  DROP POLICY IF EXISTS "Update OS Docs" ON storage.objects;
  CREATE POLICY "Update OS Docs"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'os_docs'
      AND auth.role() = 'authenticated'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );

  DROP POLICY IF EXISTS "Delete OS Docs" ON storage.objects;
  CREATE POLICY "Delete OS Docs"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'os_docs'
      AND auth.role() = 'authenticated'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );
END$$;

-- -----------------------------------------------------------------------------
-- Tabela de metadados
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.os_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  os_id uuid NOT NULL REFERENCES public.ordem_servicos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  arquivo_path text NOT NULL,
  tamanho_bytes bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_docs_empresa_os ON public.os_docs(empresa_id, os_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_docs_empresa_path ON public.os_docs(empresa_id, arquivo_path);

DROP TRIGGER IF EXISTS handle_updated_at_os_docs ON public.os_docs;
CREATE TRIGGER handle_updated_at_os_docs
  BEFORE UPDATE ON public.os_docs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.os_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_select ON public.os_docs;
CREATE POLICY policy_select ON public.os_docs
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_insert ON public.os_docs;
CREATE POLICY policy_insert ON public.os_docs
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_update ON public.os_docs;
CREATE POLICY policy_update ON public.os_docs
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_delete ON public.os_docs;
CREATE POLICY policy_delete ON public.os_docs
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- RPCs (sem enforcement RBAC aqui; será aplicado em migration separada)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.os_docs_list(uuid);
CREATE OR REPLACE FUNCTION public.os_docs_list(
  p_os_id uuid
)
RETURNS TABLE (
  id uuid,
  titulo text,
  descricao text,
  arquivo_path text,
  tamanho_bytes bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT d.id, d.titulo, d.descricao, d.arquivo_path, d.tamanho_bytes, d.created_at
  FROM public.os_docs d
  WHERE d.empresa_id = v_empresa
    AND d.os_id = p_os_id
  ORDER BY d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.os_docs_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_docs_list(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.os_doc_register(uuid, text, text, text, bigint);
CREATE OR REPLACE FUNCTION public.os_doc_register(
  p_os_id uuid,
  p_titulo text,
  p_arquivo_path text,
  p_descricao text DEFAULT NULL,
  p_tamanho_bytes bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[OS][DOCS] Nenhuma empresa ativa encontrada.' USING errcode='42501';
  END IF;
  IF p_os_id IS NULL THEN
    RAISE EXCEPTION '[OS][DOCS] os_id é obrigatório.' USING errcode='P0001';
  END IF;
  IF p_titulo IS NULL OR btrim(p_titulo) = '' THEN
    RAISE EXCEPTION '[OS][DOCS] Título é obrigatório.' USING errcode='P0001';
  END IF;
  IF p_arquivo_path IS NULL OR btrim(p_arquivo_path) = '' THEN
    RAISE EXCEPTION '[OS][DOCS] arquivo_path é obrigatório.' USING errcode='P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ordem_servicos os
    WHERE os.id = p_os_id
      AND os.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION '[OS][DOCS] O.S. não encontrada.' USING errcode='P0002';
  END IF;

  INSERT INTO public.os_docs (
    empresa_id,
    os_id,
    titulo,
    descricao,
    arquivo_path,
    tamanho_bytes
  )
  VALUES (
    v_empresa,
    p_os_id,
    p_titulo,
    p_descricao,
    p_arquivo_path,
    p_tamanho_bytes
  )
  RETURNING id INTO v_id;

  PERFORM pg_notify('app_log', '[RPC] os_doc_register ' || v_id::text);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.os_doc_register(uuid, text, text, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_doc_register(uuid, text, text, text, bigint) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.os_doc_delete(uuid);
CREATE OR REPLACE FUNCTION public.os_doc_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  DELETE FROM public.os_docs d
  WHERE d.id = p_id
    AND d.empresa_id = v_empresa;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[OS][DOCS] Documento não encontrado.' USING errcode='P0002';
  END IF;
  PERFORM pg_notify('app_log', '[RPC] os_doc_delete ' || p_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.os_doc_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_doc_delete(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Auditoria (se audit_logs existir)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR to_regclass('public.process_audit_log') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.os_docs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.os_docs';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.os_docs FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END$$;

COMMIT;

