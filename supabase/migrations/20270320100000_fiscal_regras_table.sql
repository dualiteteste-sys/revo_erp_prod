/*
  Fiscal 2026 — Parte 1A: Tabela fiscal_regras
  Regras fiscais condicionais por empresa.
  Condições: grupo de produto, NCM pattern, UF destinatário, tipo operação, regime tributário.
  Overrides: CFOP, ICMS, PIS, COFINS, IPI, cBenef, IBS/CBS.
  Prioridade numérica (menor = mais prioritário).

  5 RPCs (CRUD + search) no padrão fiscal_naturezas_operacao.
*/

-- =========================================================
-- 1. TABELA
-- =========================================================
CREATE TABLE IF NOT EXISTS public.fiscal_regras (
  id                         uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id                 uuid NOT NULL DEFAULT public.current_empresa_id(),
  nome                       text NOT NULL,
  descricao                  text,

  -- Condições (NULL = qualquer)
  condicao_produto_grupo_id  uuid,
  condicao_ncm_pattern       text,         -- ex: '8471%' para prefix match via LIKE
  condicao_destinatario_uf   text,         -- ex: 'SP', 'MG'
  condicao_tipo_operacao     text
    CHECK (condicao_tipo_operacao IS NULL OR condicao_tipo_operacao IN ('saida','entrada')),
  condicao_regime            text
    CHECK (condicao_regime IS NULL OR condicao_regime IN ('simples','normal')),

  -- Overrides fiscais (NULL = não sobrescrever)
  cfop_dentro_uf             text,
  cfop_fora_uf               text,
  icms_cst                   text,
  icms_csosn                 text,
  icms_aliquota              numeric,
  icms_reducao_base          numeric,
  codigo_beneficio_fiscal    text,
  pis_cst                    text,
  pis_aliquota               numeric,
  cofins_cst                 text,
  cofins_aliquota            numeric,
  ipi_cst                    text,
  ipi_aliquota               numeric,

  -- IBS/CBS 2026 overrides
  ibs_cst                    text,
  ibs_aliquota               numeric,
  cbs_aliquota               numeric,
  c_class_trib               text,

  -- Controle
  prioridade                 int NOT NULL DEFAULT 100,
  ativo                      bool NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fiscal_regras_pkey PRIMARY KEY (id),
  CONSTRAINT fiscal_regras_empresa_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT fiscal_regras_produto_grupo_fkey
    FOREIGN KEY (condicao_produto_grupo_id) REFERENCES public.produto_grupos(id) ON DELETE SET NULL,
  CONSTRAINT fiscal_regras_nome_uq UNIQUE (empresa_id, nome)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fiscal_regras_empresa
  ON public.fiscal_regras (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_regras_empresa_ativo
  ON public.fiscal_regras (empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_fiscal_regras_prioridade
  ON public.fiscal_regras (empresa_id, ativo, prioridade);

-- RLS
ALTER TABLE public.fiscal_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_regras_select" ON public.fiscal_regras
  FOR SELECT USING (empresa_id = public.current_empresa_id());
CREATE POLICY "fiscal_regras_insert" ON public.fiscal_regras
  FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "fiscal_regras_update" ON public.fiscal_regras
  FOR UPDATE USING (empresa_id = public.current_empresa_id())
           WITH CHECK (empresa_id = public.current_empresa_id());
CREATE POLICY "fiscal_regras_delete" ON public.fiscal_regras
  FOR DELETE USING (empresa_id = public.current_empresa_id());

-- Revoke direct client access
REVOKE ALL ON TABLE public.fiscal_regras FROM authenticated;

-- Trigger updated_at
CREATE TRIGGER handle_updated_at_fiscal_regras
  BEFORE UPDATE ON public.fiscal_regras
  FOR EACH ROW EXECUTE PROCEDURE public.tg_set_updated_at();


-- =========================================================
-- 2. RPCs
-- =========================================================

-- 2.1 LIST
CREATE OR REPLACE FUNCTION public.fiscal_regras_list(
  p_q     text    DEFAULT NULL,
  p_ativo boolean DEFAULT true,
  p_limit int     DEFAULT 200
)
RETURNS SETOF public.fiscal_regras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 200), 1), 500);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.fiscal_regras r
    WHERE r.empresa_id = v_empresa
      AND (p_ativo IS NULL OR r.ativo = p_ativo)
      AND (
        v_q IS NULL
        OR r.nome ILIKE '%' || v_q || '%'
        OR r.descricao ILIKE '%' || v_q || '%'
        OR r.cfop_dentro_uf ILIKE '%' || v_q || '%'
        OR r.cfop_fora_uf ILIKE '%' || v_q || '%'
      )
    ORDER BY r.prioridade ASC, r.nome
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_regras_list(text, boolean, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_regras_list(text, boolean, int) TO authenticated, service_role;


-- 2.2 GET
CREATE OR REPLACE FUNCTION public.fiscal_regras_get(
  p_id uuid
)
RETURNS SETOF public.fiscal_regras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.fiscal_regras r
    WHERE r.id = p_id
      AND r.empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_regras_get(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_regras_get(uuid) TO authenticated, service_role;


-- 2.3 UPSERT
CREATE OR REPLACE FUNCTION public.fiscal_regras_upsert(
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid := (p_payload->>'id')::uuid;
  v_result  uuid;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  PERFORM public.assert_empresa_role_at_least('admin');

  IF v_id IS NOT NULL THEN
    UPDATE public.fiscal_regras SET
      nome                       = coalesce(p_payload->>'nome', nome),
      descricao                  = p_payload->>'descricao',
      condicao_produto_grupo_id  = (p_payload->>'condicao_produto_grupo_id')::uuid,
      condicao_ncm_pattern       = p_payload->>'condicao_ncm_pattern',
      condicao_destinatario_uf   = p_payload->>'condicao_destinatario_uf',
      condicao_tipo_operacao     = p_payload->>'condicao_tipo_operacao',
      condicao_regime            = p_payload->>'condicao_regime',
      cfop_dentro_uf             = p_payload->>'cfop_dentro_uf',
      cfop_fora_uf               = p_payload->>'cfop_fora_uf',
      icms_cst                   = p_payload->>'icms_cst',
      icms_csosn                 = p_payload->>'icms_csosn',
      icms_aliquota              = (p_payload->>'icms_aliquota')::numeric,
      icms_reducao_base          = (p_payload->>'icms_reducao_base')::numeric,
      codigo_beneficio_fiscal    = p_payload->>'codigo_beneficio_fiscal',
      pis_cst                    = p_payload->>'pis_cst',
      pis_aliquota               = (p_payload->>'pis_aliquota')::numeric,
      cofins_cst                 = p_payload->>'cofins_cst',
      cofins_aliquota            = (p_payload->>'cofins_aliquota')::numeric,
      ipi_cst                    = p_payload->>'ipi_cst',
      ipi_aliquota               = (p_payload->>'ipi_aliquota')::numeric,
      ibs_cst                    = p_payload->>'ibs_cst',
      ibs_aliquota               = (p_payload->>'ibs_aliquota')::numeric,
      cbs_aliquota               = (p_payload->>'cbs_aliquota')::numeric,
      c_class_trib               = p_payload->>'c_class_trib',
      prioridade                 = coalesce((p_payload->>'prioridade')::int, 100),
      ativo                      = coalesce((p_payload->>'ativo')::boolean, true)
    WHERE id = v_id
      AND empresa_id = v_empresa
    RETURNING id INTO v_result;

    IF v_result IS NULL THEN
      RAISE EXCEPTION 'Regra fiscal não encontrada ou sem permissão.' USING errcode='42501';
    END IF;
  ELSE
    INSERT INTO public.fiscal_regras (
      empresa_id, nome, descricao,
      condicao_produto_grupo_id, condicao_ncm_pattern,
      condicao_destinatario_uf, condicao_tipo_operacao, condicao_regime,
      cfop_dentro_uf, cfop_fora_uf,
      icms_cst, icms_csosn, icms_aliquota, icms_reducao_base,
      codigo_beneficio_fiscal,
      pis_cst, pis_aliquota,
      cofins_cst, cofins_aliquota,
      ipi_cst, ipi_aliquota,
      ibs_cst, ibs_aliquota, cbs_aliquota, c_class_trib,
      prioridade, ativo
    ) VALUES (
      v_empresa,
      coalesce(p_payload->>'nome', 'Nova Regra'),
      p_payload->>'descricao',
      (p_payload->>'condicao_produto_grupo_id')::uuid,
      p_payload->>'condicao_ncm_pattern',
      p_payload->>'condicao_destinatario_uf',
      p_payload->>'condicao_tipo_operacao',
      p_payload->>'condicao_regime',
      p_payload->>'cfop_dentro_uf',
      p_payload->>'cfop_fora_uf',
      p_payload->>'icms_cst',
      p_payload->>'icms_csosn',
      (p_payload->>'icms_aliquota')::numeric,
      (p_payload->>'icms_reducao_base')::numeric,
      p_payload->>'codigo_beneficio_fiscal',
      p_payload->>'pis_cst',
      (p_payload->>'pis_aliquota')::numeric,
      p_payload->>'cofins_cst',
      (p_payload->>'cofins_aliquota')::numeric,
      p_payload->>'ipi_cst',
      (p_payload->>'ipi_aliquota')::numeric,
      p_payload->>'ibs_cst',
      (p_payload->>'ibs_aliquota')::numeric,
      (p_payload->>'cbs_aliquota')::numeric,
      p_payload->>'c_class_trib',
      coalesce((p_payload->>'prioridade')::int, 100),
      coalesce((p_payload->>'ativo')::boolean, true)
    )
    RETURNING id INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_regras_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_regras_upsert(jsonb) TO authenticated, service_role;


-- 2.4 DELETE (soft)
CREATE OR REPLACE FUNCTION public.fiscal_regras_delete(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  PERFORM public.assert_empresa_role_at_least('admin');

  UPDATE public.fiscal_regras
  SET ativo = false
  WHERE id = p_id
    AND empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_regras_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_regras_delete(uuid) TO authenticated, service_role;


-- 2.5 SEARCH (para uso no motor fiscal — retorno leve)
CREATE OR REPLACE FUNCTION public.fiscal_regras_search(
  p_q     text DEFAULT NULL,
  p_limit int  DEFAULT 15
)
RETURNS TABLE (
  id              uuid,
  nome            text,
  descricao       text,
  condicao_produto_grupo_id uuid,
  condicao_ncm_pattern      text,
  condicao_destinatario_uf  text,
  condicao_tipo_operacao    text,
  condicao_regime           text,
  cfop_dentro_uf  text,
  cfop_fora_uf    text,
  icms_cst        text,
  icms_csosn      text,
  prioridade      int,
  ativo           bool
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 15), 1), 50);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  RETURN QUERY
    SELECT
      r.id, r.nome, r.descricao,
      r.condicao_produto_grupo_id,
      r.condicao_ncm_pattern,
      r.condicao_destinatario_uf,
      r.condicao_tipo_operacao,
      r.condicao_regime,
      r.cfop_dentro_uf, r.cfop_fora_uf,
      r.icms_cst, r.icms_csosn,
      r.prioridade, r.ativo
    FROM public.fiscal_regras r
    WHERE r.empresa_id = v_empresa
      AND r.ativo = true
      AND (
        v_q IS NULL
        OR r.nome ILIKE '%' || v_q || '%'
        OR r.descricao ILIKE '%' || v_q || '%'
      )
    ORDER BY
      CASE WHEN v_q IS NOT NULL AND r.nome ILIKE v_q || '%' THEN 0 ELSE 1 END,
      r.prioridade ASC, r.nome
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_regras_search(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_regras_search(text, int) TO authenticated, service_role;


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
