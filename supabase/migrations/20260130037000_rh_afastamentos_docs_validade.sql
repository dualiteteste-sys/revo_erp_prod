/*
  RH básico (ponta-a-ponta)

  - Colaboradores: status/afastamento + campos adicionais
  - Anexos: bucket + tabela + RPCs (upload via client + registro via RPC)
  - Treinamentos: validade/reciclagem (campos + cálculo ao concluir participante)
  - Histórico: habilita audit_logs_trigger nas tabelas de RH (se audit_logs existir)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Colaboradores: campos adicionais + status/afastamento
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.rh_colaboradores') IS NOT NULL THEN
    ALTER TABLE public.rh_colaboradores
      ADD COLUMN IF NOT EXISTS telefone text,
      ADD COLUMN IF NOT EXISTS matricula text,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
      ADD COLUMN IF NOT EXISTS afastado_desde date,
      ADD COLUMN IF NOT EXISTS afastado_ate date,
      ADD COLUMN IF NOT EXISTS afastamento_motivo text,
      ADD COLUMN IF NOT EXISTS data_demissao date,
      ADD COLUMN IF NOT EXISTS observacoes text;
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public.rh_colaboradores') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'rh_colaboradores_status_check'
        AND conrelid = 'public.rh_colaboradores'::regclass
    ) THEN
      ALTER TABLE public.rh_colaboradores
        ADD CONSTRAINT rh_colaboradores_status_check
          CHECK (status = ANY (ARRAY['ativo','afastado','ferias','licenca','desligado']));
    END IF;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.rh_colaborador_afastamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'outros' CHECK (tipo = ANY (ARRAY['ferias','licenca','atestado','outros'])),
  motivo text,
  data_inicio date NOT NULL DEFAULT current_date,
  data_fim date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_afast_empresa_colab ON public.rh_colaborador_afastamentos(empresa_id, colaborador_id, data_inicio DESC);

DROP TRIGGER IF EXISTS handle_updated_at_rh_colab_afast ON public.rh_colaborador_afastamentos;
CREATE TRIGGER handle_updated_at_rh_colab_afast
  BEFORE UPDATE ON public.rh_colaborador_afastamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.rh_colaborador_afastamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_select ON public.rh_colaborador_afastamentos;
CREATE POLICY policy_select ON public.rh_colaborador_afastamentos
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_insert ON public.rh_colaborador_afastamentos;
CREATE POLICY policy_insert ON public.rh_colaborador_afastamentos
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_update ON public.rh_colaborador_afastamentos;
CREATE POLICY policy_update ON public.rh_colaborador_afastamentos
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_delete ON public.rh_colaborador_afastamentos;
CREATE POLICY policy_delete ON public.rh_colaborador_afastamentos
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- RPCs: Afastamentos
DROP FUNCTION IF EXISTS public.rh_list_afastamentos(uuid);
CREATE OR REPLACE FUNCTION public.rh_list_afastamentos(p_colaborador_id uuid)
RETURNS TABLE (
  id uuid,
  tipo text,
  motivo text,
  data_inicio date,
  data_fim date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT a.id, a.tipo, a.motivo, a.data_inicio, a.data_fim
  FROM public.rh_colaborador_afastamentos a
  WHERE a.empresa_id = v_empresa
    AND a.colaborador_id = p_colaborador_id
  ORDER BY a.data_inicio DESC, a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_afastamentos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_list_afastamentos(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_add_afastamento(uuid, text, text, date, date);
CREATE OR REPLACE FUNCTION public.rh_add_afastamento(
  p_colaborador_id uuid,
  p_tipo text DEFAULT 'outros',
  p_motivo text DEFAULT NULL,
  p_data_inicio date DEFAULT current_date,
  p_data_fim date DEFAULT NULL
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
    RAISE EXCEPTION '[RH][AFASTAMENTO] Nenhuma empresa ativa encontrada.' USING errcode='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rh_colaboradores c
    WHERE c.id = p_colaborador_id AND c.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION '[RH][AFASTAMENTO] Colaborador não encontrado.' USING errcode='P0002';
  END IF;

  IF p_tipo NOT IN ('ferias','licenca','atestado','outros') THEN
    p_tipo := 'outros';
  END IF;

  INSERT INTO public.rh_colaborador_afastamentos (
    empresa_id, colaborador_id, tipo, motivo, data_inicio, data_fim
  ) VALUES (
    v_empresa, p_colaborador_id, p_tipo, p_motivo, COALESCE(p_data_inicio, current_date), p_data_fim
  )
  RETURNING id INTO v_id;

  -- Atualiza status no colaborador (apenas se afastamento em aberto)
  IF p_data_fim IS NULL THEN
    UPDATE public.rh_colaboradores
    SET
      status = 'afastado',
      afastado_desde = COALESCE(p_data_inicio, current_date),
      afastado_ate = NULL,
      afastamento_motivo = p_motivo
    WHERE id = p_colaborador_id
      AND empresa_id = v_empresa;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] rh_add_afastamento ' || v_id::text);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_add_afastamento(uuid, text, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_add_afastamento(uuid, text, text, date, date) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_encerrar_afastamento(uuid, date);
CREATE OR REPLACE FUNCTION public.rh_encerrar_afastamento(
  p_afastamento_id uuid,
  p_data_fim date DEFAULT current_date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_colaborador_id uuid;
BEGIN
  SELECT a.colaborador_id
    INTO v_colaborador_id
  FROM public.rh_colaborador_afastamentos a
  WHERE a.id = p_afastamento_id
    AND a.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RH][AFASTAMENTO] Registro não encontrado.' USING errcode='P0002';
  END IF;

  UPDATE public.rh_colaborador_afastamentos
  SET data_fim = COALESCE(p_data_fim, current_date), updated_at = now()
  WHERE id = p_afastamento_id
    AND empresa_id = v_empresa;

  -- Se não há mais afastamento em aberto, retorna status para ativo (sem alterar ativo/desligamento)
  IF NOT EXISTS (
    SELECT 1
    FROM public.rh_colaborador_afastamentos a2
    WHERE a2.empresa_id = v_empresa
      AND a2.colaborador_id = v_colaborador_id
      AND a2.data_fim IS NULL
  ) THEN
    UPDATE public.rh_colaboradores
    SET
      status = CASE WHEN status = 'afastado' THEN 'ativo' ELSE status END,
      afastado_desde = NULL,
      afastado_ate = NULL,
      afastamento_motivo = NULL
    WHERE id = v_colaborador_id
      AND empresa_id = v_empresa
      AND status = 'afastado';
  END IF;

  PERFORM pg_notify('app_log', '[RPC] rh_encerrar_afastamento ' || p_afastamento_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_encerrar_afastamento(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_encerrar_afastamento(uuid, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Treinamentos: validade/reciclagem
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.rh_treinamentos') IS NOT NULL THEN
    ALTER TABLE public.rh_treinamentos
      ADD COLUMN IF NOT EXISTS validade_meses int;
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public.rh_treinamento_participantes') IS NOT NULL THEN
    ALTER TABLE public.rh_treinamento_participantes
      ADD COLUMN IF NOT EXISTS validade_ate date,
      ADD COLUMN IF NOT EXISTS proxima_reciclagem date;
  END IF;
END$$;

-- Upsert do treinamento: incluir validade_meses (campo novo)
CREATE OR REPLACE FUNCTION public.rh_upsert_treinamento(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.rh_treinamentos
    SET
      nome = p_payload->>'nome',
      descricao = p_payload->>'descricao',
      tipo = p_payload->>'tipo',
      status = p_payload->>'status',
      data_inicio = (p_payload->>'data_inicio')::timestamptz,
      data_fim = (p_payload->>'data_fim')::timestamptz,
      carga_horaria_horas = (p_payload->>'carga_horaria_horas')::numeric,
      instrutor = p_payload->>'instrutor',
      localizacao = p_payload->>'localizacao',
      custo_estimado = (p_payload->>'custo_estimado')::numeric,
      custo_real = (p_payload->>'custo_real')::numeric,
      objetivo = p_payload->>'objetivo',
      validade_meses = NULLIF(p_payload->>'validade_meses','')::int
    WHERE id = (p_payload->>'id')::uuid
      AND empresa_id = v_empresa_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.rh_treinamentos (
      empresa_id, nome, descricao, tipo, status, data_inicio, data_fim,
      carga_horaria_horas, instrutor, localizacao, custo_estimado, custo_real, objetivo, validade_meses
    ) VALUES (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'descricao',
      p_payload->>'tipo',
      COALESCE(p_payload->>'status', 'planejado'),
      (p_payload->>'data_inicio')::timestamptz,
      (p_payload->>'data_fim')::timestamptz,
      (p_payload->>'carga_horaria_horas')::numeric,
      p_payload->>'instrutor',
      p_payload->>'localizacao',
      (p_payload->>'custo_estimado')::numeric,
      (p_payload->>'custo_real')::numeric,
      p_payload->>'objetivo',
      NULLIF(p_payload->>'validade_meses','')::int
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log','[RPC] rh_upsert_treinamento: ' || v_id);
  RETURN public.rh_get_treinamento_details(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_treinamento(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_upsert_treinamento(jsonb) TO authenticated, service_role;

-- Detalhes do treinamento: incluir validade/reciclagem por participante
CREATE OR REPLACE FUNCTION public.rh_get_treinamento_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_treinamento jsonb;
  v_participantes jsonb;
BEGIN
  SELECT to_jsonb(t.*)
  INTO v_treinamento
  FROM public.rh_treinamentos t
  WHERE t.id = p_id
    AND t.empresa_id = v_empresa_id;

  IF v_treinamento IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'colaborador_id', p.colaborador_id,
      'nome', c.nome,
      'cargo', cg.nome,
      'status', p.status,
      'nota_final', p.nota_final,
      'certificado_url', p.certificado_url,
      'eficacia_avaliada', p.eficacia_avaliada,
      'parecer_eficacia', p.parecer_eficacia,
      'validade_ate', p.validade_ate,
      'proxima_reciclagem', p.proxima_reciclagem
    )
    ORDER BY c.nome
  )
  INTO v_participantes
  FROM public.rh_treinamento_participantes p
  JOIN public.rh_colaboradores c ON p.colaborador_id = c.id
  LEFT JOIN public.rh_cargos cg ON c.cargo_id = cg.id
  WHERE p.treinamento_id = p_id
    AND p.empresa_id = v_empresa_id;

  RETURN v_treinamento || jsonb_build_object('participantes', COALESCE(v_participantes, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.rh_get_treinamento_details(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_get_treinamento_details(uuid) TO authenticated, service_role;

-- Atualiza a RPC (assinatura já existente) para preencher validade ao concluir.
CREATE OR REPLACE FUNCTION public.rh_manage_participante(
  p_treinamento_id uuid,
  p_colaborador_id uuid,
  p_action text,
  p_status text default 'inscrito',
  p_nota numeric default null,
  p_certificado_url text default null,
  p_parecer_eficacia text default null,
  p_eficacia_avaliada boolean default false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_validade_meses int;
  v_conclusao date;
BEGIN
  IF p_action = 'remove' THEN
    DELETE FROM public.rh_treinamento_participantes
    WHERE treinamento_id = p_treinamento_id
      AND colaborador_id = p_colaborador_id
      AND empresa_id = v_empresa_id;
  ELSIF p_action = 'add' THEN
    INSERT INTO public.rh_treinamento_participantes (empresa_id, treinamento_id, colaborador_id, status)
    VALUES (v_empresa_id, p_treinamento_id, p_colaborador_id, p_status)
    ON CONFLICT (empresa_id, treinamento_id, colaborador_id) DO NOTHING;
  ELSIF p_action = 'update' THEN
    -- valida período de conclusão/validade
    SELECT t.validade_meses,
           COALESCE(t.data_fim::date, t.data_inicio::date, current_date)
      INTO v_validade_meses, v_conclusao
    FROM public.rh_treinamentos t
    WHERE t.id = p_treinamento_id
      AND t.empresa_id = v_empresa_id;

    UPDATE public.rh_treinamento_participantes
    SET
      status = p_status,
      nota_final = p_nota,
      certificado_url = p_certificado_url,
      parecer_eficacia = p_parecer_eficacia,
      eficacia_avaliada = p_eficacia_avaliada,
      validade_ate = CASE
        WHEN p_status = 'concluido' AND v_validade_meses IS NOT NULL AND v_validade_meses > 0
          THEN (v_conclusao + (make_interval(months => v_validade_meses)))::date
        ELSE validade_ate
      END,
      proxima_reciclagem = CASE
        WHEN p_status = 'concluido' AND v_validade_meses IS NOT NULL AND v_validade_meses > 0
          THEN ((v_conclusao + (make_interval(months => v_validade_meses)))::date - 30)
        ELSE proxima_reciclagem
      END,
      updated_at = now()
    WHERE treinamento_id = p_treinamento_id
      AND colaborador_id = p_colaborador_id
      AND empresa_id = v_empresa_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] rh_manage_participante: ' || p_action || ' training=' || p_treinamento_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Anexos (RH Docs): bucket + tabela + RPCs
-- -----------------------------------------------------------------------------

-- Bucket e políticas (apenas se o schema storage existir)
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('rh_docs', 'rh_docs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Read RH Docs" ON storage.objects;
  CREATE POLICY "Read RH Docs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'rh_docs'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );

  DROP POLICY IF EXISTS "Write RH Docs" ON storage.objects;
  CREATE POLICY "Write RH Docs"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'rh_docs'
      AND auth.role() = 'authenticated'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );

  DROP POLICY IF EXISTS "Update RH Docs" ON storage.objects;
  CREATE POLICY "Update RH Docs"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'rh_docs'
      AND auth.role() = 'authenticated'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );

  DROP POLICY IF EXISTS "Delete RH Docs" ON storage.objects;
  CREATE POLICY "Delete RH Docs"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'rh_docs'
      AND auth.role() = 'authenticated'
      AND split_part(name, '/', 1) = public.current_empresa_id()::text
    );
END$$;

CREATE TABLE IF NOT EXISTS public.rh_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['colaborador','treinamento'])),
  entity_id uuid NOT NULL,
  titulo text NOT NULL,
  descricao text,
  arquivo_path text NOT NULL,
  tamanho_bytes bigint,
  versao int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_docs_empresa_entity ON public.rh_docs(empresa_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rh_docs_empresa_path ON public.rh_docs(empresa_id, arquivo_path);

DROP TRIGGER IF EXISTS handle_updated_at_rh_docs ON public.rh_docs;
CREATE TRIGGER handle_updated_at_rh_docs
  BEFORE UPDATE ON public.rh_docs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.rh_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_select ON public.rh_docs;
CREATE POLICY policy_select ON public.rh_docs
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_insert ON public.rh_docs;
CREATE POLICY policy_insert ON public.rh_docs
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_update ON public.rh_docs;
CREATE POLICY policy_update ON public.rh_docs
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_delete ON public.rh_docs;
CREATE POLICY policy_delete ON public.rh_docs
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP FUNCTION IF EXISTS public.rh_docs_list(text, uuid, boolean);
CREATE OR REPLACE FUNCTION public.rh_docs_list(
  p_entity_type text,
  p_entity_id uuid,
  p_only_latest boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  titulo text,
  descricao text,
  arquivo_path text,
  tamanho_bytes bigint,
  versao int,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF p_only_latest THEN
    RETURN QUERY
    SELECT DISTINCT ON (d.titulo)
      d.id, d.titulo, d.descricao, d.arquivo_path, d.tamanho_bytes, d.versao, d.created_at
    FROM public.rh_docs d
    WHERE d.empresa_id = v_empresa
      AND d.entity_type = p_entity_type
      AND d.entity_id = p_entity_id
    ORDER BY d.titulo, d.versao DESC, d.created_at DESC;
  ELSE
    RETURN QUERY
    SELECT d.id, d.titulo, d.descricao, d.arquivo_path, d.tamanho_bytes, d.versao, d.created_at
    FROM public.rh_docs d
    WHERE d.empresa_id = v_empresa
      AND d.entity_type = p_entity_type
      AND d.entity_id = p_entity_id
    ORDER BY d.created_at DESC, d.versao DESC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_docs_list(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_docs_list(text, uuid, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_doc_register(text, uuid, text, text, text, bigint);
CREATE OR REPLACE FUNCTION public.rh_doc_register(
  p_entity_type text,
  p_entity_id uuid,
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
  v_versao int;
  v_id uuid;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[RH][DOCS] Nenhuma empresa ativa encontrada.' USING errcode='42501';
  END IF;
  IF p_entity_type NOT IN ('colaborador','treinamento') THEN
    RAISE EXCEPTION '[RH][DOCS] entity_type inválido.' USING errcode='22023';
  END IF;
  IF p_titulo IS NULL OR btrim(p_titulo) = '' THEN
    RAISE EXCEPTION '[RH][DOCS] Título é obrigatório.' USING errcode='P0001';
  END IF;
  IF p_arquivo_path IS NULL OR btrim(p_arquivo_path) = '' THEN
    RAISE EXCEPTION '[RH][DOCS] arquivo_path é obrigatório.' USING errcode='P0001';
  END IF;

  IF p_entity_type = 'colaborador' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rh_colaboradores c
      WHERE c.id = p_entity_id AND c.empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION '[RH][DOCS] Colaborador não encontrado.' USING errcode='P0002';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.rh_treinamentos t
      WHERE t.id = p_entity_id AND t.empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION '[RH][DOCS] Treinamento não encontrado.' USING errcode='P0002';
    END IF;
  END IF;

  SELECT COALESCE(MAX(versao), 0) + 1
    INTO v_versao
  FROM public.rh_docs d
  WHERE d.empresa_id = v_empresa
    AND d.entity_type = p_entity_type
    AND d.entity_id = p_entity_id
    AND lower(d.titulo) = lower(p_titulo);

  INSERT INTO public.rh_docs (
    empresa_id, entity_type, entity_id, titulo, descricao, arquivo_path, tamanho_bytes, versao
  ) VALUES (
    v_empresa, p_entity_type, p_entity_id, p_titulo, p_descricao, p_arquivo_path, p_tamanho_bytes, v_versao
  )
  RETURNING id INTO v_id;

  PERFORM pg_notify('app_log', '[RPC] rh_doc_register ' || v_id::text);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_doc_register(text, uuid, text, text, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_doc_register(text, uuid, text, text, text, bigint) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_doc_delete(uuid);
CREATE OR REPLACE FUNCTION public.rh_doc_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  DELETE FROM public.rh_docs d
  WHERE d.id = p_id
    AND d.empresa_id = v_empresa;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RH][DOCS] Documento não encontrado.' USING errcode='P0002';
  END IF;
  PERFORM pg_notify('app_log', '[RPC] rh_doc_delete ' || p_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_doc_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_doc_delete(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Histórico: audit_logs_trigger em tabelas de RH (se audit_logs existir)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL OR to_regclass('public.process_audit_log') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.rh_cargos') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_cargos';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_cargos FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_competencias') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_competencias';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_competencias FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_colaboradores') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_colaboradores';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_colaboradores FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_colaborador_competencias') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_colaborador_competencias';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_colaborador_competencias FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_colaborador_afastamentos') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_colaborador_afastamentos';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_colaborador_afastamentos FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_treinamentos') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_treinamentos';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_treinamentos FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_treinamento_participantes') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_treinamento_participantes';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_treinamento_participantes FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
  IF to_regclass('public.rh_docs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_logs_trigger ON public.rh_docs';
    EXECUTE 'CREATE TRIGGER audit_logs_trigger AFTER INSERT OR UPDATE OR DELETE ON public.rh_docs FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END;
$$;

COMMIT;
