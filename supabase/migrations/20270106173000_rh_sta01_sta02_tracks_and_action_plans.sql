/*
  RH-STA-01 / RH-STA-02 — Estado da Arte (RH)

  Motivo
  - RH-STA-01: precisamos de "trilhas" (treinamentos obrigatórios por cargo) + compliance (vencimentos/alertas).
  - RH-STA-02: precisamos de plano de ação rastreável para gaps de competências (matriz → ação → histórico).

  Impacto
  - Apenas adiciona tabelas/RPCs; não altera dados existentes.
  - Todas as tabelas são multi-tenant via empresa_id + RLS.

  Reversibilidade
  - Reversível removendo as tabelas e funções criadas (não recomendado em PROD).
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- RH-STA-01: Trilhas (treinamentos obrigatórios por cargo)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rh_cargo_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.rh_cargos(id) ON DELETE CASCADE,
  treinamento_id uuid NOT NULL REFERENCES public.rh_treinamentos(id) ON DELETE CASCADE,
  obrigatorio boolean NOT NULL DEFAULT true,
  validade_meses integer NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, cargo_id, treinamento_id)
);

CREATE INDEX IF NOT EXISTS idx_rh_cargo_trein_empresa_cargo ON public.rh_cargo_treinamentos (empresa_id, cargo_id);
CREATE INDEX IF NOT EXISTS idx_rh_cargo_trein_empresa_trein ON public.rh_cargo_treinamentos (empresa_id, treinamento_id);

DROP TRIGGER IF EXISTS handle_updated_at_rh_cargo_treinamentos ON public.rh_cargo_treinamentos;
CREATE TRIGGER handle_updated_at_rh_cargo_treinamentos
  BEFORE UPDATE ON public.rh_cargo_treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.rh_cargo_treinamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_select ON public.rh_cargo_treinamentos;
CREATE POLICY policy_select ON public.rh_cargo_treinamentos
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_insert ON public.rh_cargo_treinamentos;
CREATE POLICY policy_insert ON public.rh_cargo_treinamentos
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_update ON public.rh_cargo_treinamentos;
CREATE POLICY policy_update ON public.rh_cargo_treinamentos
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_delete ON public.rh_cargo_treinamentos;
CREATE POLICY policy_delete ON public.rh_cargo_treinamentos
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP FUNCTION IF EXISTS public.rh_list_cargo_treinamentos(uuid);
CREATE OR REPLACE FUNCTION public.rh_list_cargo_treinamentos(p_cargo_id uuid)
RETURNS TABLE (
  id uuid,
  treinamento_id uuid,
  treinamento_nome text,
  obrigatorio boolean,
  validade_meses integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY
  SELECT
    ct.id,
    ct.treinamento_id,
    t.nome AS treinamento_nome,
    ct.obrigatorio,
    ct.validade_meses
  FROM public.rh_cargo_treinamentos ct
  JOIN public.rh_treinamentos t ON t.id = ct.treinamento_id
  WHERE ct.empresa_id = v_empresa
    AND ct.cargo_id = p_cargo_id
  ORDER BY ct.obrigatorio DESC, t.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_cargo_treinamentos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_list_cargo_treinamentos(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_upsert_cargo_treinamento(uuid, uuid, boolean, integer);
CREATE OR REPLACE FUNCTION public.rh_upsert_cargo_treinamento(
  p_cargo_id uuid,
  p_treinamento_id uuid,
  p_obrigatorio boolean DEFAULT true,
  p_validade_meses integer DEFAULT NULL
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
  PERFORM public.require_permission_for_current_user('rh','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[RH][TRILHA] Nenhuma empresa ativa encontrada.' USING errcode='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rh_cargos c WHERE c.id = p_cargo_id AND c.empresa_id = v_empresa) THEN
    RAISE EXCEPTION '[RH][TRILHA] Cargo não encontrado.' USING errcode='P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rh_treinamentos t WHERE t.id = p_treinamento_id AND t.empresa_id = v_empresa) THEN
    RAISE EXCEPTION '[RH][TRILHA] Treinamento não encontrado.' USING errcode='P0002';
  END IF;

  INSERT INTO public.rh_cargo_treinamentos (empresa_id, cargo_id, treinamento_id, obrigatorio, validade_meses)
  VALUES (v_empresa, p_cargo_id, p_treinamento_id, COALESCE(p_obrigatorio, true), NULLIF(p_validade_meses, 0))
  ON CONFLICT (empresa_id, cargo_id, treinamento_id)
  DO UPDATE SET
    obrigatorio = EXCLUDED.obrigatorio,
    validade_meses = EXCLUDED.validade_meses,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_cargo_treinamento(uuid, uuid, boolean, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_upsert_cargo_treinamento(uuid, uuid, boolean, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_delete_cargo_treinamento(uuid);
CREATE OR REPLACE FUNCTION public.rh_delete_cargo_treinamento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('rh','manage');
  DELETE FROM public.rh_cargo_treinamentos
  WHERE id = p_id
    AND empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_delete_cargo_treinamento(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_delete_cargo_treinamento(uuid) TO authenticated, service_role;

-- Compliance: visão de vencimentos / pendências por cargo/colaborador
DROP FUNCTION IF EXISTS public.rh_training_compliance_summary(integer);
CREATE OR REPLACE FUNCTION public.rh_training_compliance_summary(p_days_ahead integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_today date := current_date;
  v_days integer := GREATEST(COALESCE(p_days_ahead, 30), 0);
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');

  RETURN (
    WITH req AS (
      SELECT
        c.id AS colaborador_id,
        c.nome AS colaborador_nome,
        c.cargo_id,
        cg.nome AS cargo_nome,
        ct.treinamento_id,
        ct.obrigatorio,
        ct.validade_meses
      FROM public.rh_colaboradores c
      JOIN public.rh_cargos cg ON cg.id = c.cargo_id
      JOIN public.rh_cargo_treinamentos ct ON ct.cargo_id = c.cargo_id AND ct.empresa_id = c.empresa_id
      WHERE c.empresa_id = v_empresa
        AND c.ativo IS TRUE
        AND c.cargo_id IS NOT NULL
        AND ct.obrigatorio IS TRUE
    ),
    part AS (
      SELECT DISTINCT ON (p.colaborador_id, p.treinamento_id)
        p.colaborador_id,
        p.treinamento_id,
        p.participante_status,
        p.validade_ate,
        p.proxima_reciclagem,
        p.updated_at
      FROM public.rh_treinamento_participantes p
      WHERE p.empresa_id = v_empresa
      ORDER BY p.colaborador_id, p.treinamento_id, p.updated_at DESC
    ),
    items AS (
      SELECT
        r.colaborador_id,
        r.colaborador_nome,
        r.cargo_nome,
        r.treinamento_id,
        t.nome AS treinamento_nome,
        COALESCE(pa.participante_status, 'missing') AS participante_status,
        pa.validade_ate,
        pa.proxima_reciclagem,
        CASE
          WHEN pa.colaborador_id IS NULL THEN 'missing'
          WHEN pa.participante_status <> 'concluido' THEN 'pending'
          WHEN pa.proxima_reciclagem IS NOT NULL AND pa.proxima_reciclagem::date <= v_today THEN 'overdue'
          WHEN pa.proxima_reciclagem IS NOT NULL AND pa.proxima_reciclagem::date <= (v_today + v_days) THEN 'due_soon'
          WHEN pa.validade_ate IS NOT NULL AND pa.validade_ate::date < v_today THEN 'overdue'
          WHEN pa.validade_ate IS NOT NULL AND pa.validade_ate::date <= (v_today + v_days) THEN 'due_soon'
          ELSE 'ok'
        END AS compliance_status
      FROM req r
      JOIN public.rh_treinamentos t ON t.id = r.treinamento_id
      LEFT JOIN part pa ON pa.colaborador_id = r.colaborador_id AND pa.treinamento_id = r.treinamento_id
      WHERE t.empresa_id = v_empresa
    ),
    summary AS (
      SELECT
        COUNT(*)::int AS total_required,
        COUNT(*) FILTER (WHERE compliance_status = 'ok')::int AS ok,
        COUNT(*) FILTER (WHERE compliance_status = 'due_soon')::int AS due_soon,
        COUNT(*) FILTER (WHERE compliance_status = 'overdue')::int AS overdue,
        COUNT(*) FILTER (WHERE compliance_status IN ('missing','pending'))::int AS missing
      FROM items
    )
    SELECT jsonb_build_object(
      'summary', (SELECT to_jsonb(summary) FROM summary),
      'items', COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.compliance_status DESC, i.colaborador_nome ASC, i.treinamento_nome ASC)
          FROM items i
          WHERE i.compliance_status <> 'ok'
          LIMIT 200
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rh_training_compliance_summary(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_training_compliance_summary(integer) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RH-STA-02: Plano de ação por gap de competência
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rh_competencia_planos_acao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  competencia_id uuid NOT NULL REFERENCES public.rh_competencias(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aberto' CHECK (status = ANY (ARRAY['aberto','em_andamento','concluido','cancelado'])),
  prioridade integer NOT NULL DEFAULT 2 CHECK (prioridade BETWEEN 1 AND 3),
  due_date date,
  responsavel text,
  notas text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, colaborador_id, competencia_id)
);

CREATE INDEX IF NOT EXISTS idx_rh_plano_acao_empresa ON public.rh_competencia_planos_acao (empresa_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_rh_plano_acao_colab ON public.rh_competencia_planos_acao (empresa_id, colaborador_id);

DROP TRIGGER IF EXISTS handle_updated_at_rh_competencia_planos_acao ON public.rh_competencia_planos_acao;
CREATE TRIGGER handle_updated_at_rh_competencia_planos_acao
  BEFORE UPDATE ON public.rh_competencia_planos_acao
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.rh_competencia_planos_acao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_select ON public.rh_competencia_planos_acao;
CREATE POLICY policy_select ON public.rh_competencia_planos_acao
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_insert ON public.rh_competencia_planos_acao;
CREATE POLICY policy_insert ON public.rh_competencia_planos_acao
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_update ON public.rh_competencia_planos_acao;
CREATE POLICY policy_update ON public.rh_competencia_planos_acao
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_delete ON public.rh_competencia_planos_acao;
CREATE POLICY policy_delete ON public.rh_competencia_planos_acao
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP FUNCTION IF EXISTS public.rh_list_planos_acao_competencias(uuid);
CREATE OR REPLACE FUNCTION public.rh_list_planos_acao_competencias(p_cargo_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  colaborador_id uuid,
  colaborador_nome text,
  cargo_nome text,
  competencia_id uuid,
  competencia_nome text,
  status text,
  prioridade integer,
  due_date date,
  responsavel text,
  notas text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY
  SELECT
    a.id,
    a.colaborador_id,
    c.nome AS colaborador_nome,
    cg.nome AS cargo_nome,
    a.competencia_id,
    cp.nome AS competencia_nome,
    a.status,
    a.prioridade,
    a.due_date,
    a.responsavel,
    a.notas,
    a.updated_at
  FROM public.rh_competencia_planos_acao a
  JOIN public.rh_colaboradores c ON c.id = a.colaborador_id
  LEFT JOIN public.rh_cargos cg ON cg.id = c.cargo_id
  JOIN public.rh_competencias cp ON cp.id = a.competencia_id
  WHERE a.empresa_id = v_empresa
    AND (p_cargo_id IS NULL OR c.cargo_id = p_cargo_id)
  ORDER BY
    CASE a.status WHEN 'aberto' THEN 1 WHEN 'em_andamento' THEN 2 WHEN 'concluido' THEN 3 ELSE 4 END,
    a.prioridade ASC,
    a.due_date NULLS LAST,
    a.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_planos_acao_competencias(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_list_planos_acao_competencias(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rh_upsert_plano_acao_competencia(jsonb);
CREATE OR REPLACE FUNCTION public.rh_upsert_plano_acao_competencia(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_colaborador uuid := (p_payload->>'colaborador_id')::uuid;
  v_competencia uuid := (p_payload->>'competencia_id')::uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('rh','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[RH][PLANO] Nenhuma empresa ativa encontrada.' USING errcode='42501';
  END IF;

  IF v_colaborador IS NULL OR v_competencia IS NULL THEN
    RAISE EXCEPTION '[RH][PLANO] colaborador_id e competencia_id são obrigatórios.' USING errcode='22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rh_colaboradores c WHERE c.id = v_colaborador AND c.empresa_id = v_empresa) THEN
    RAISE EXCEPTION '[RH][PLANO] Colaborador não encontrado.' USING errcode='P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rh_competencias c WHERE c.id = v_competencia AND c.empresa_id = v_empresa) THEN
    RAISE EXCEPTION '[RH][PLANO] Competência não encontrada.' USING errcode='P0002';
  END IF;

  INSERT INTO public.rh_competencia_planos_acao (
    empresa_id,
    colaborador_id,
    competencia_id,
    status,
    prioridade,
    due_date,
    responsavel,
    notas
  ) VALUES (
    v_empresa,
    v_colaborador,
    v_competencia,
    COALESCE(NULLIF(p_payload->>'status',''), 'aberto'),
    COALESCE(NULLIF(p_payload->>'prioridade','')::int, 2),
    NULLIF(p_payload->>'due_date','')::date,
    NULLIF(p_payload->>'responsavel',''),
    NULLIF(p_payload->>'notas','')
  )
  ON CONFLICT (empresa_id, colaborador_id, competencia_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    prioridade = EXCLUDED.prioridade,
    due_date = EXCLUDED.due_date,
    responsavel = EXCLUDED.responsavel,
    notas = EXCLUDED.notas,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_plano_acao_competencia(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_upsert_plano_acao_competencia(jsonb) TO authenticated, service_role;

COMMIT;

