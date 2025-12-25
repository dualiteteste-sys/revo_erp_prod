-- =============================================================================
-- Financeiro: Tesouraria (Contas Correntes, Movimentos, Extratos e Conciliação)
-- Baseado em `supabase/migrations_legacy/20250221000000_create_treasury_module.sql`
-- =============================================================================

BEGIN;

-- =============================================
-- 0) Limpeza segura de funções legadas (se existirem)
-- =============================================

DROP FUNCTION IF EXISTS public.financeiro_contas_correntes_list(text, boolean, int, int);
DROP FUNCTION IF EXISTS public.financeiro_contas_correntes_get(uuid);
DROP FUNCTION IF EXISTS public.financeiro_contas_correntes_upsert(jsonb);
DROP FUNCTION IF EXISTS public.financeiro_contas_correntes_delete(uuid);

DROP FUNCTION IF EXISTS public.financeiro_movimentacoes_list(
  uuid, date, date, text, text, int, int
);
DROP FUNCTION IF EXISTS public.financeiro_movimentacoes_get(uuid);
DROP FUNCTION IF EXISTS public.financeiro_movimentacoes_upsert(jsonb);
DROP FUNCTION IF EXISTS public.financeiro_movimentacoes_delete(uuid);

DROP FUNCTION IF EXISTS public.financeiro_extratos_bancarios_list(
  uuid, date, date, boolean, text, int, int
);
DROP FUNCTION IF EXISTS public.financeiro_extratos_bancarios_importar(uuid, jsonb);
DROP FUNCTION IF EXISTS public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid);
DROP FUNCTION IF EXISTS public.financeiro_extratos_bancarios_desvincular(uuid);

-- =============================================
-- 1) Tabela: Contas Correntes
-- =============================================

CREATE TABLE IF NOT EXISTS public.financeiro_contas_correntes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  uuid NOT NULL DEFAULT public.current_empresa_id(),
  nome                        text NOT NULL,
  apelido                     text,
  banco_codigo                text,
  banco_nome                  text,
  agencia                     text,
  conta                       text,
  digito                      text,
  tipo_conta                  text NOT NULL DEFAULT 'corrente'
    CHECK (tipo_conta IN ('corrente','poupanca','carteira','caixa','outro')),
  moeda                       text NOT NULL DEFAULT 'BRL',
  saldo_inicial               numeric(18,2) NOT NULL DEFAULT 0,
  data_saldo_inicial          date DEFAULT current_date,
  limite_credito              numeric(18,2) NOT NULL DEFAULT 0,
  permite_saldo_negativo      boolean NOT NULL DEFAULT false,
  ativo                       boolean NOT NULL DEFAULT true,
  padrao_para_pagamentos      boolean NOT NULL DEFAULT false,
  padrao_para_recebimentos    boolean NOT NULL DEFAULT false,
  observacoes                 text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),

  CONSTRAINT fin_cc_empresa_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT fin_cc_empresa_nome_uk
    UNIQUE (empresa_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_fin_cc_empresa
  ON public.financeiro_contas_correntes (empresa_id);

CREATE INDEX IF NOT EXISTS idx_fin_cc_empresa_ativo
  ON public.financeiro_contas_correntes (empresa_id, ativo);

CREATE INDEX IF NOT EXISTS idx_fin_cc_empresa_banco
  ON public.financeiro_contas_correntes (empresa_id, banco_codigo);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at_financeiro_contas_correntes'
      AND tgrelid = 'public.financeiro_contas_correntes'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at_financeiro_contas_correntes
      BEFORE UPDATE ON public.financeiro_contas_correntes
      FOR EACH ROW
      EXECUTE PROCEDURE public.tg_set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.financeiro_contas_correntes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_cc_select" ON public.financeiro_contas_correntes;
DROP POLICY IF EXISTS "fin_cc_insert" ON public.financeiro_contas_correntes;
DROP POLICY IF EXISTS "fin_cc_update" ON public.financeiro_contas_correntes;
DROP POLICY IF EXISTS "fin_cc_delete" ON public.financeiro_contas_correntes;

CREATE POLICY "fin_cc_select"
  ON public.financeiro_contas_correntes
  FOR SELECT
  USING (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_cc_insert"
  ON public.financeiro_contas_correntes
  FOR INSERT
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_cc_update"
  ON public.financeiro_contas_correntes
  FOR UPDATE
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_cc_delete"
  ON public.financeiro_contas_correntes
  FOR DELETE
  USING (empresa_id = public.current_empresa_id());

-- =============================================
-- 2) Tabela: Movimentações
-- =============================================

CREATE TABLE IF NOT EXISTS public.financeiro_movimentacoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL DEFAULT public.current_empresa_id(),
  conta_corrente_id  uuid NOT NULL,
  data_movimento     date NOT NULL,
  data_competencia   date,
  tipo_mov           text NOT NULL CHECK (tipo_mov IN ('entrada','saida')),
  valor              numeric(18,2) NOT NULL CHECK (valor > 0),
  descricao          text,
  documento_ref      text,
  origem_tipo        text,
  origem_id          uuid,
  categoria          text,
  centro_custo       text,
  conciliado         boolean NOT NULL DEFAULT false,
  observacoes        text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),

  CONSTRAINT fin_mov_empresa_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT fin_mov_cc_fkey
    FOREIGN KEY (conta_corrente_id) REFERENCES public.financeiro_contas_correntes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fin_mov_empresa
  ON public.financeiro_movimentacoes (empresa_id);

CREATE INDEX IF NOT EXISTS idx_fin_mov_empresa_cc_data
  ON public.financeiro_movimentacoes (empresa_id, conta_corrente_id, data_movimento);

CREATE INDEX IF NOT EXISTS idx_fin_mov_empresa_cc_conciliado
  ON public.financeiro_movimentacoes (empresa_id, conta_corrente_id, conciliado);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at_financeiro_movimentacoes'
      AND tgrelid = 'public.financeiro_movimentacoes'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at_financeiro_movimentacoes
      BEFORE UPDATE ON public.financeiro_movimentacoes
      FOR EACH ROW
      EXECUTE PROCEDURE public.tg_set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.financeiro_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_mov_select" ON public.financeiro_movimentacoes;
DROP POLICY IF EXISTS "fin_mov_insert" ON public.financeiro_movimentacoes;
DROP POLICY IF EXISTS "fin_mov_update" ON public.financeiro_movimentacoes;
DROP POLICY IF EXISTS "fin_mov_delete" ON public.financeiro_movimentacoes;

CREATE POLICY "fin_mov_select"
  ON public.financeiro_movimentacoes
  FOR SELECT
  USING (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_mov_insert"
  ON public.financeiro_movimentacoes
  FOR INSERT
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_mov_update"
  ON public.financeiro_movimentacoes
  FOR UPDATE
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_mov_delete"
  ON public.financeiro_movimentacoes
  FOR DELETE
  USING (empresa_id = public.current_empresa_id());

-- =============================================
-- 3) Tabela: Extratos Bancários
-- =============================================

CREATE TABLE IF NOT EXISTS public.financeiro_extratos_bancarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL DEFAULT public.current_empresa_id(),
  conta_corrente_id     uuid NOT NULL,
  data_lancamento       date NOT NULL,
  descricao             text,
  identificador_banco   text,
  documento_ref         text,
  tipo_lancamento       text NOT NULL CHECK (tipo_lancamento IN ('credito','debito')),
  valor                 numeric(18,2) NOT NULL CHECK (valor > 0),
  saldo_apos_lancamento numeric(18,2),
  origem_importacao     text,
  hash_importacao       text,
  linha_bruta           text,
  movimentacao_id       uuid,
  conciliado            boolean NOT NULL DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  CONSTRAINT fin_extrato_empresa_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT fin_extrato_cc_fkey
    FOREIGN KEY (conta_corrente_id) REFERENCES public.financeiro_contas_correntes(id) ON DELETE CASCADE,
  CONSTRAINT fin_extrato_mov_fkey
    FOREIGN KEY (movimentacao_id) REFERENCES public.financeiro_movimentacoes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fin_extrato_empresa
  ON public.financeiro_extratos_bancarios (empresa_id);

CREATE INDEX IF NOT EXISTS idx_fin_extrato_empresa_cc_data
  ON public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, data_lancamento);

CREATE INDEX IF NOT EXISTS idx_fin_extrato_empresa_cc_conciliado
  ON public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, conciliado);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at_financeiro_extratos_bancarios'
      AND tgrelid = 'public.financeiro_extratos_bancarios'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at_financeiro_extratos_bancarios
      BEFORE UPDATE ON public.financeiro_extratos_bancarios
      FOR EACH ROW
      EXECUTE PROCEDURE public.tg_set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.financeiro_extratos_bancarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_extrato_select" ON public.financeiro_extratos_bancarios;
DROP POLICY IF EXISTS "fin_extrato_insert" ON public.financeiro_extratos_bancarios;
DROP POLICY IF EXISTS "fin_extrato_update" ON public.financeiro_extratos_bancarios;
DROP POLICY IF EXISTS "fin_extrato_delete" ON public.financeiro_extratos_bancarios;

CREATE POLICY "fin_extrato_select"
  ON public.financeiro_extratos_bancarios
  FOR SELECT
  USING (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_extrato_insert"
  ON public.financeiro_extratos_bancarios
  FOR INSERT
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_extrato_update"
  ON public.financeiro_extratos_bancarios
  FOR UPDATE
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY "fin_extrato_delete"
  ON public.financeiro_extratos_bancarios
  FOR DELETE
  USING (empresa_id = public.current_empresa_id());

-- =============================================
-- 4) RPCs - Contas Correntes
-- =============================================

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_list(
  p_search text DEFAULT NULL,
  p_ativo boolean DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  nome text,
  apelido text,
  banco_codigo text,
  banco_nome text,
  agencia text,
  conta text,
  tipo_conta text,
  moeda text,
  saldo_atual numeric,
  ativo boolean,
  padrao_para_pagamentos boolean,
  padrao_para_recebimentos boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.nome,
    cc.apelido,
    cc.banco_codigo,
    cc.banco_nome,
    cc.agencia,
    cc.conta,
    cc.tipo_conta,
    cc.moeda,
    (
      cc.saldo_inicial
      + COALESCE((
          SELECT SUM(
                   CASE WHEN m.tipo_mov = 'entrada'
                        THEN m.valor
                        ELSE -m.valor
                   END
                 )
          FROM public.financeiro_movimentacoes m
          WHERE m.empresa_id = v_empresa
            AND m.conta_corrente_id = cc.id
            AND m.data_movimento <= current_date
        ), 0)
    ) AS saldo_atual,
    cc.ativo,
    cc.padrao_para_pagamentos,
    cc.padrao_para_recebimentos,
    COUNT(*) OVER() AS total_count
  FROM public.financeiro_contas_correntes cc
  WHERE cc.empresa_id = v_empresa
    AND (p_ativo IS NULL OR cc.ativo = p_ativo)
    AND (
      p_search IS NULL
      OR cc.nome ILIKE '%'||p_search||'%'
      OR COALESCE(cc.apelido,'') ILIKE '%'||p_search||'%'
      OR COALESCE(cc.banco_nome,'') ILIKE '%'||p_search||'%'
      OR COALESCE(cc.banco_codigo,'') ILIKE '%'||p_search||'%'
      OR COALESCE(cc.conta,'') ILIKE '%'||p_search||'%'
    )
  ORDER BY cc.ativo DESC, cc.nome ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_list(text, boolean, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_list(text, boolean, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_result jsonb;
  v_saldo_atual numeric;
BEGIN
  SELECT
    cc.saldo_inicial
    + COALESCE((
        SELECT SUM(
                 CASE WHEN m.tipo_mov = 'entrada'
                      THEN m.valor
                      ELSE -m.valor
                 END
               )
        FROM public.financeiro_movimentacoes m
        WHERE m.empresa_id = v_empresa
          AND m.conta_corrente_id = cc.id
          AND m.data_movimento <= current_date
      ), 0)
  INTO v_saldo_atual
  FROM public.financeiro_contas_correntes cc
  WHERE cc.id = p_id
    AND cc.empresa_id = v_empresa;

  SELECT
    to_jsonb(cc.*)
    || jsonb_build_object('saldo_atual', COALESCE(v_saldo_atual, 0))
  INTO v_result
  FROM public.financeiro_contas_correntes cc
  WHERE cc.id = p_id
    AND cc.empresa_id = v_empresa;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_padrao_pag boolean;
  v_padrao_rec boolean;
BEGIN
  v_padrao_pag := COALESCE((p_payload->>'padrao_para_pagamentos')::boolean, false);
  v_padrao_rec := COALESCE((p_payload->>'padrao_para_recebimentos')::boolean, false);

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.financeiro_contas_correntes cc
    SET
      nome                     = p_payload->>'nome',
      apelido                  = p_payload->>'apelido',
      banco_codigo             = p_payload->>'banco_codigo',
      banco_nome               = p_payload->>'banco_nome',
      agencia                  = p_payload->>'agencia',
      conta                    = p_payload->>'conta',
      digito                   = p_payload->>'digito',
      tipo_conta               = COALESCE(p_payload->>'tipo_conta', tipo_conta),
      moeda                    = COALESCE(p_payload->>'moeda', moeda),
      saldo_inicial            = COALESCE((p_payload->>'saldo_inicial')::numeric, saldo_inicial),
      data_saldo_inicial       = COALESCE((p_payload->>'data_saldo_inicial')::date, data_saldo_inicial),
      limite_credito           = COALESCE((p_payload->>'limite_credito')::numeric, limite_credito),
      permite_saldo_negativo   = COALESCE((p_payload->>'permite_saldo_negativo')::boolean, permite_saldo_negativo),
      ativo                    = COALESCE((p_payload->>'ativo')::boolean, ativo),
      padrao_para_pagamentos   = v_padrao_pag,
      padrao_para_recebimentos = v_padrao_rec,
      observacoes              = p_payload->>'observacoes'
    WHERE cc.id = (p_payload->>'id')::uuid
      AND cc.empresa_id = v_empresa
    RETURNING cc.id INTO v_id;
  ELSE
    INSERT INTO public.financeiro_contas_correntes (
      empresa_id, nome, apelido, banco_codigo, banco_nome, agencia, conta, digito, tipo_conta, moeda,
      saldo_inicial, data_saldo_inicial, limite_credito, permite_saldo_negativo, ativo,
      padrao_para_pagamentos, padrao_para_recebimentos, observacoes
    ) VALUES (
      v_empresa,
      p_payload->>'nome',
      p_payload->>'apelido',
      p_payload->>'banco_codigo',
      p_payload->>'banco_nome',
      p_payload->>'agencia',
      p_payload->>'conta',
      p_payload->>'digito',
      COALESCE(p_payload->>'tipo_conta', 'corrente'),
      COALESCE(p_payload->>'moeda', 'BRL'),
      COALESCE((p_payload->>'saldo_inicial')::numeric, 0),
      COALESCE((p_payload->>'data_saldo_inicial')::date, current_date),
      COALESCE((p_payload->>'limite_credito')::numeric, 0),
      COALESCE((p_payload->>'permite_saldo_negativo')::boolean, false),
      COALESCE((p_payload->>'ativo')::boolean, true),
      v_padrao_pag,
      v_padrao_rec,
      p_payload->>'observacoes'
    )
    RETURNING id INTO v_id;
  END IF;

  IF v_padrao_pag THEN
    UPDATE public.financeiro_contas_correntes
    SET padrao_para_pagamentos = false
    WHERE empresa_id = v_empresa
      AND id <> v_id;
  END IF;

  IF v_padrao_rec THEN
    UPDATE public.financeiro_contas_correntes
    SET padrao_para_recebimentos = false
    WHERE empresa_id = v_empresa
      AND id <> v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_contas_correntes_upsert: ' || v_id);
  RETURN public.financeiro_contas_correntes_get(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_upsert(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_has_ref boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_movimentacoes m
    WHERE m.empresa_id = v_empresa
      AND m.conta_corrente_id = p_id
  ) INTO v_has_ref;

  IF v_has_ref THEN
    RAISE EXCEPTION 'Conta corrente possui movimentações vinculadas. Desative a conta em vez de excluir.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_extratos_bancarios e
    WHERE e.empresa_id = v_empresa
      AND e.conta_corrente_id = p_id
  ) INTO v_has_ref;

  IF v_has_ref THEN
    RAISE EXCEPTION 'Conta corrente possui extratos vinculados. Desative a conta em vez de excluir.';
  END IF;

  DELETE FROM public.financeiro_contas_correntes
  WHERE id = p_id AND empresa_id = v_empresa;

  PERFORM pg_notify('app_log', '[RPC] financeiro_contas_correntes_delete: ' || p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_delete(uuid) TO authenticated, service_role;

-- =============================================
-- 5) RPCs - Movimentações
-- =============================================

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_list(
  p_conta_corrente_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_tipo_mov text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  data_movimento date,
  data_competencia date,
  tipo_mov text,
  descricao text,
  documento_ref text,
  origem_tipo text,
  origem_id uuid,
  valor_entrada numeric,
  valor_saida numeric,
  saldo_acumulado numeric,
  conciliado boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_saldo_base numeric;
BEGIN
  IF p_conta_corrente_id IS NULL THEN
    RAISE EXCEPTION 'p_conta_corrente_id é obrigatório.';
  END IF;

  IF p_tipo_mov IS NOT NULL AND p_tipo_mov NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'p_tipo_mov inválido. Use entrada ou saida.';
  END IF;

  SELECT
    cc.saldo_inicial
    + COALESCE((
        SELECT SUM(
                 CASE WHEN m.tipo_mov = 'entrada'
                      THEN m.valor
                      ELSE -m.valor
                 END
               )
        FROM public.financeiro_movimentacoes m
        WHERE m.empresa_id = v_empresa
          AND m.conta_corrente_id = cc.id
          AND (p_start_date IS NOT NULL AND m.data_movimento < p_start_date)
      ), 0)
  INTO v_saldo_base
  FROM public.financeiro_contas_correntes cc
  WHERE cc.id = p_conta_corrente_id
    AND cc.empresa_id = v_empresa;

  v_saldo_base := COALESCE(v_saldo_base, 0);

  RETURN QUERY
  WITH movs AS (
    SELECT
      m.id,
      m.data_movimento,
      m.data_competencia,
      m.tipo_mov,
      m.descricao,
      m.documento_ref,
      m.origem_tipo,
      m.origem_id,
      m.valor,
      m.conciliado,
      m.created_at,
      COUNT(*) OVER() AS total_count,
      CASE WHEN m.tipo_mov = 'entrada' THEN m.valor ELSE 0 END AS val_entrada,
      CASE WHEN m.tipo_mov = 'saida'   THEN m.valor ELSE 0 END AS val_saida
    FROM public.financeiro_movimentacoes m
    WHERE m.empresa_id = v_empresa
      AND m.conta_corrente_id = p_conta_corrente_id
      AND (p_start_date IS NULL OR m.data_movimento >= p_start_date)
      AND (p_end_date IS NULL OR m.data_movimento <= p_end_date)
      AND (p_tipo_mov IS NULL OR m.tipo_mov = p_tipo_mov)
      AND (
        p_q IS NULL
        OR m.descricao ILIKE '%'||p_q||'%'
        OR COALESCE(m.documento_ref,'') ILIKE '%'||p_q||'%'
        OR COALESCE(m.origem_tipo,'') ILIKE '%'||p_q||'%'
      )
  )
  SELECT
    mv.id,
    mv.data_movimento,
    mv.data_competencia,
    mv.tipo_mov,
    mv.descricao,
    mv.documento_ref,
    mv.origem_tipo,
    mv.origem_id,
    mv.val_entrada AS valor_entrada,
    mv.val_saida AS valor_saida,
    v_saldo_base
      + SUM(
          CASE WHEN mv.tipo_mov = 'entrada' THEN mv.valor ELSE -mv.valor END
        ) OVER (ORDER BY mv.data_movimento ASC, mv.created_at ASC, mv.id ASC) AS saldo_acumulado,
    mv.conciliado,
    mv.total_count
  FROM movs mv
  ORDER BY mv.data_movimento ASC, mv.created_at ASC, mv.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_list(uuid, date, date, text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_list(uuid, date, date, text, text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_result jsonb;
BEGIN
  SELECT
    to_jsonb(m.*) || jsonb_build_object('conta_nome', cc.nome)
  INTO v_result
  FROM public.financeiro_movimentacoes m
  JOIN public.financeiro_contas_correntes cc
    ON cc.id = m.conta_corrente_id
   AND cc.empresa_id = v_empresa
  WHERE m.id = p_id
    AND m.empresa_id = v_empresa;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_tipo text;
  v_valor numeric;
  v_cc_id uuid;
BEGIN
  v_tipo := COALESCE(p_payload->>'tipo_mov', 'entrada');
  v_valor := (p_payload->>'valor')::numeric;
  v_cc_id := (p_payload->>'conta_corrente_id')::uuid;

  IF v_cc_id IS NULL THEN
    RAISE EXCEPTION 'conta_corrente_id é obrigatório.';
  END IF;
  IF v_tipo NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'tipo_mov inválido.';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'valor inválido.';
  END IF;

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.financeiro_movimentacoes m
    SET
      conta_corrente_id = v_cc_id,
      data_movimento    = COALESCE((p_payload->>'data_movimento')::date, data_movimento),
      data_competencia  = (p_payload->>'data_competencia')::date,
      tipo_mov          = v_tipo,
      valor             = v_valor,
      descricao         = p_payload->>'descricao',
      documento_ref     = p_payload->>'documento_ref',
      origem_tipo       = p_payload->>'origem_tipo',
      origem_id         = NULLIF(p_payload->>'origem_id','')::uuid,
      categoria         = p_payload->>'categoria',
      centro_custo      = p_payload->>'centro_custo',
      observacoes       = p_payload->>'observacoes'
    WHERE m.id = (p_payload->>'id')::uuid
      AND m.empresa_id = v_empresa
    RETURNING m.id INTO v_id;
  ELSE
    INSERT INTO public.financeiro_movimentacoes (
      empresa_id, conta_corrente_id, data_movimento, data_competencia, tipo_mov, valor,
      descricao, documento_ref, origem_tipo, origem_id, categoria, centro_custo, conciliado, observacoes
    ) VALUES (
      v_empresa,
      v_cc_id,
      COALESCE((p_payload->>'data_movimento')::date, current_date),
      (p_payload->>'data_competencia')::date,
      v_tipo,
      v_valor,
      p_payload->>'descricao',
      p_payload->>'documento_ref',
      p_payload->>'origem_tipo',
      NULLIF(p_payload->>'origem_id','')::uuid,
      p_payload->>'categoria',
      p_payload->>'centro_custo',
      COALESCE((p_payload->>'conciliado')::boolean, false),
      p_payload->>'observacoes'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_movimentacoes_upsert: ' || v_id);
  RETURN public.financeiro_movimentacoes_get(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_upsert(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  DELETE FROM public.financeiro_movimentacoes m
  WHERE m.id = p_id
    AND m.empresa_id = v_empresa;

  PERFORM pg_notify('app_log', '[RPC] financeiro_movimentacoes_delete: ' || p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_delete(uuid) TO authenticated, service_role;

-- =============================================
-- 6) RPCs - Extratos e Conciliação
-- =============================================

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_list(
  p_conta_corrente_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_conciliado boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  data_lancamento date,
  descricao text,
  documento_ref text,
  tipo_lancamento text,
  valor numeric,
  saldo_apos_lancamento numeric,
  conciliado boolean,
  movimentacao_id uuid,
  movimentacao_data date,
  movimentacao_descricao text,
  movimentacao_valor numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF p_conta_corrente_id IS NULL THEN
    RAISE EXCEPTION 'p_conta_corrente_id é obrigatório.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.data_lancamento,
    e.descricao,
    e.documento_ref,
    e.tipo_lancamento,
    e.valor,
    e.saldo_apos_lancamento,
    e.conciliado,
    e.movimentacao_id,
    m.data_movimento AS movimentacao_data,
    m.descricao AS movimentacao_descricao,
    m.valor AS movimentacao_valor,
    COUNT(*) OVER() AS total_count
  FROM public.financeiro_extratos_bancarios e
  LEFT JOIN public.financeiro_movimentacoes m
    ON m.id = e.movimentacao_id
   AND m.empresa_id = v_empresa
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date IS NULL OR e.data_lancamento <= p_end_date)
    AND (p_conciliado IS NULL OR e.conciliado = p_conciliado)
    AND (
      p_q IS NULL
      OR e.descricao ILIKE '%'||p_q||'%'
      OR COALESCE(e.documento_ref,'') ILIKE '%'||p_q||'%'
    )
  ORDER BY e.data_lancamento ASC, e.created_at ASC, e.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_importar(
  p_conta_corrente_id uuid,
  p_itens jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_item jsonb;
  v_count integer := 0;
  v_data date;
  v_desc text;
  v_doc text;
  v_tipo text;
  v_valor numeric;
  v_saldo numeric;
  v_id_banco text;
  v_hash text;
  v_linha text;
BEGIN
  IF jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens deve ser um array JSON.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financeiro_contas_correntes cc
    WHERE cc.id = p_conta_corrente_id
      AND cc.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta corrente não encontrada ou acesso negado.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_data     := (v_item->>'data_lancamento')::date;
    v_desc     := v_item->>'descricao';
    v_doc      := v_item->>'documento_ref';
    v_tipo     := COALESCE(v_item->>'tipo_lancamento', 'credito');
    v_valor    := (v_item->>'valor')::numeric;
    v_saldo    := (v_item->>'saldo_apos_lancamento')::numeric;
    v_id_banco := v_item->>'identificador_banco';
    v_hash     := v_item->>'hash_importacao';
    v_linha    := v_item->>'linha_bruta';

    IF v_data IS NULL OR v_valor IS NULL OR v_valor <= 0 THEN
      CONTINUE;
    END IF;

    IF v_tipo NOT IN ('credito','debito') THEN
      v_tipo := 'credito';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.financeiro_extratos_bancarios e
      WHERE e.empresa_id = v_empresa
        AND e.conta_corrente_id = p_conta_corrente_id
        AND e.data_lancamento = v_data
        AND e.valor = v_valor
        AND COALESCE(e.identificador_banco,'') = COALESCE(v_id_banco,'')
        AND COALESCE(e.documento_ref,'') = COALESCE(v_doc,'')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.financeiro_extratos_bancarios (
      empresa_id, conta_corrente_id, data_lancamento, descricao, identificador_banco, documento_ref,
      tipo_lancamento, valor, saldo_apos_lancamento, origem_importacao, hash_importacao, linha_bruta, conciliado
    ) VALUES (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      v_id_banco,
      v_doc,
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      v_hash,
      v_linha,
      false
    );

    v_count := v_count + 1;
  END LOOP;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_importar: conta=' || p_conta_corrente_id || ' qtd=' || v_count);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_importar(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_importar(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_vincular_movimentacao(
  p_extrato_id uuid,
  p_movimentacao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov record;
BEGIN
  SELECT * INTO v_extrato
  FROM public.financeiro_extratos_bancarios e
  WHERE e.id = p_extrato_id
    AND e.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado ou acesso negado.';
  END IF;

  SELECT * INTO v_mov
  FROM public.financeiro_movimentacoes m
  WHERE m.id = p_movimentacao_id
    AND m.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada ou acesso negado.';
  END IF;

  IF v_extrato.conta_corrente_id <> v_mov.conta_corrente_id THEN
    RAISE EXCEPTION 'Conta do extrato difere da conta da movimentação.';
  END IF;

  IF v_extrato.tipo_lancamento = 'credito' AND v_mov.tipo_mov <> 'entrada' THEN
    RAISE EXCEPTION 'Lançamento de crédito só pode ser conciliado com movimentação de entrada.';
  END IF;

  IF v_extrato.tipo_lancamento = 'debito' AND v_mov.tipo_mov <> 'saida' THEN
    RAISE EXCEPTION 'Lançamento de débito só pode ser conciliado com movimentação de saída.';
  END IF;

  UPDATE public.financeiro_extratos_bancarios
  SET movimentacao_id = v_mov.id,
      conciliado = true
  WHERE id = v_extrato.id;

  UPDATE public.financeiro_movimentacoes
  SET conciliado = true
  WHERE id = v_mov.id;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_desvincular(p_extrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_mov_id uuid;
BEGIN
  SELECT movimentacao_id
  INTO v_mov_id
  FROM public.financeiro_extratos_bancarios e
  WHERE e.id = p_extrato_id
    AND e.empresa_id = v_empresa
  FOR UPDATE;

  UPDATE public.financeiro_extratos_bancarios
  SET movimentacao_id = NULL,
      conciliado = false
  WHERE id = p_extrato_id
    AND empresa_id = v_empresa;

  IF v_mov_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.financeiro_extratos_bancarios e2
      WHERE e2.empresa_id = v_empresa
        AND e2.movimentacao_id = v_mov_id
    ) THEN
      UPDATE public.financeiro_movimentacoes
      SET conciliado = false
      WHERE id = v_mov_id
        AND empresa_id = v_empresa;
    END IF;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_desvincular: extrato=' || p_extrato_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_desvincular(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_desvincular(uuid) TO authenticated, service_role;

COMMIT;

