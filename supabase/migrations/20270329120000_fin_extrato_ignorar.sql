/*
  FIN — "Ignorar" lançamentos de extrato bancário na conciliação

  Motivação: quando pagamentos de cartão de crédito (ou outros fluxos)
  já estão baixados, as linhas correspondentes do extrato bancário ficam
  pendentes de conciliação para sempre. Esta feature permite que o usuário
  marque esses lançamentos como "Ignorados" — removendo-os da contagem de
  pendentes e da aba principal de conciliação, mantendo audit trail completo.

  Inclui:
  - Colunas ignorado, motivo_ignorado, ignorado_at, ignorado_por
  - RPCs: ignorar (batch), designorar (batch)
  - Atualização das RPCs: list (tesouraria e extrato), summary, vincular_movimentacao
*/

-- ============================================================================
-- 1. Schema: novas colunas em financeiro_extratos_bancarios
-- ============================================================================
ALTER TABLE public.financeiro_extratos_bancarios
  ADD COLUMN IF NOT EXISTS ignorado boolean NOT NULL DEFAULT false;

ALTER TABLE public.financeiro_extratos_bancarios
  ADD COLUMN IF NOT EXISTS motivo_ignorado text;

ALTER TABLE public.financeiro_extratos_bancarios
  ADD COLUMN IF NOT EXISTS ignorado_at timestamptz;

ALTER TABLE public.financeiro_extratos_bancarios
  ADD COLUMN IF NOT EXISTS ignorado_por uuid;

-- Partial index para queries de filtro (apenas ignorados)
CREATE INDEX IF NOT EXISTS idx_fin_extrato_empresa_cc_ignorado
  ON public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, ignorado)
  WHERE ignorado = true;

-- ============================================================================
-- 2. RPC: financeiro_extratos_bancarios_ignorar (batch)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_ignorar(
  p_extrato_ids uuid[],
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_user_id uuid := auth.uid();
  v_count integer;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','manage');

  IF p_extrato_ids IS NULL OR array_length(p_extrato_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'count', 0, 'message', 'Nenhum lançamento informado.');
  END IF;

  UPDATE public.financeiro_extratos_bancarios
  SET ignorado = true,
      motivo_ignorado = NULLIF(BTRIM(COALESCE(p_motivo, '')), ''),
      ignorado_at = now(),
      ignorado_por = v_user_id
  WHERE empresa_id = v_empresa
    AND id = ANY(p_extrato_ids)
    AND conciliado = false
    AND ignorado = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', v_count || ' lançamento(s) ignorado(s).'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_ignorar(uuid[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_ignorar(uuid[], text) TO authenticated, service_role;

-- ============================================================================
-- 3. RPC: financeiro_extratos_bancarios_designorar (batch)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_designorar(
  p_extrato_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_count integer;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','manage');

  IF p_extrato_ids IS NULL OR array_length(p_extrato_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'count', 0, 'message', 'Nenhum lançamento informado.');
  END IF;

  UPDATE public.financeiro_extratos_bancarios
  SET ignorado = false,
      motivo_ignorado = NULL,
      ignorado_at = NULL,
      ignorado_por = NULL
  WHERE empresa_id = v_empresa
    AND id = ANY(p_extrato_ids)
    AND ignorado = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', v_count || ' lançamento(s) restaurado(s).'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_designorar(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_designorar(uuid[]) TO authenticated, service_role;

-- ============================================================================
-- 4. Update: financeiro_extratos_bancarios_list (TesourariaPage)
--    Adiciona: p_ignorado, retorna ignorado + motivo_ignorado
-- ============================================================================

-- Drop assinatura antiga (7 params)
DROP FUNCTION IF EXISTS public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int);

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_list(
  p_conta_corrente_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_conciliado boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_ignorado boolean DEFAULT NULL
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
  ignorado boolean,
  motivo_ignorado text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

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
    e.ignorado,
    e.motivo_ignorado,
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
    AND (p_ignorado IS NULL OR e.ignorado = p_ignorado)
    AND (
      p_q IS NULL
      OR e.descricao ILIKE '%'||p_q||'%'
      OR COALESCE(e.documento_ref,'') ILIKE '%'||p_q||'%'
    )
  ORDER BY e.data_lancamento ASC, e.created_at ASC, e.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int, boolean) TO authenticated, service_role;

-- ============================================================================
-- 5. Update: financeiro_extrato_bancario_list (ExtratoPage)
--    Adiciona: p_ignorado, retorna ignorado + motivo_ignorado
-- ============================================================================

-- Drop assinatura antiga (8 params)
DROP FUNCTION IF EXISTS public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, int, int);

CREATE OR REPLACE FUNCTION public.financeiro_extrato_bancario_list(
  p_conta_corrente_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_tipo_lancamento text DEFAULT NULL,
  p_conciliado boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_ignorado boolean DEFAULT NULL
)
RETURNS TABLE (
  id uuid, conta_corrente_id uuid, conta_nome text,
  data_lancamento date, descricao text, documento_ref text,
  tipo_lancamento text, valor numeric, saldo_apos_lancamento numeric,
  conciliado boolean, movimentacao_id uuid,
  movimentacao_data date, movimentacao_tipo text,
  movimentacao_descricao text, movimentacao_valor numeric,
  ignorado boolean, motivo_ignorado text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_uq text := public.unaccent(coalesce(p_q, ''));
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  IF p_tipo_lancamento IS NOT NULL AND p_tipo_lancamento NOT IN ('credito','debito') THEN
    RAISE EXCEPTION 'p_tipo_lancamento inválido. Use credito, debito ou null.';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.conta_corrente_id,
    cc.nome AS conta_nome,
    e.data_lancamento, e.descricao, e.documento_ref,
    e.tipo_lancamento, e.valor, e.saldo_apos_lancamento,
    e.conciliado, e.movimentacao_id,
    m.data_movimento   AS movimentacao_data,
    m.tipo_mov         AS movimentacao_tipo,
    m.descricao        AS movimentacao_descricao,
    m.valor            AS movimentacao_valor,
    e.ignorado, e.motivo_ignorado,
    count(*) OVER()    AS total_count
  FROM public.financeiro_extratos_bancarios e
  JOIN public.financeiro_contas_correntes cc
    ON cc.id = e.conta_corrente_id
   AND cc.empresa_id = v_empresa
  LEFT JOIN public.financeiro_movimentacoes m
    ON m.id = e.movimentacao_id
   AND m.empresa_id = v_empresa
  WHERE e.empresa_id = v_empresa
    AND (p_conta_corrente_id IS NULL OR e.conta_corrente_id = p_conta_corrente_id)
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date)
    AND (p_conciliado IS NULL OR e.conciliado = p_conciliado)
    AND (p_ignorado IS NULL OR e.ignorado = p_ignorado)
    AND (p_tipo_lancamento IS NULL OR e.tipo_lancamento = p_tipo_lancamento)
    AND (
      p_q IS NULL
      OR public.unaccent(e.descricao) ILIKE '%' || v_uq || '%'
      OR coalesce(e.documento_ref,'') ILIKE '%' || p_q || '%'
      OR coalesce(e.identificador_banco,'') ILIKE '%' || p_q || '%'
    )
  ORDER BY e.data_lancamento ASC, e.created_at ASC, e.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, int, int, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, int, int, boolean) TO authenticated, service_role;

-- ============================================================================
-- 6. Update: financeiro_extrato_bancario_summary
--    Excluir ignorados da contagem de "não conciliados"
-- ============================================================================
CREATE OR REPLACE FUNCTION public.financeiro_extrato_bancario_summary(
  p_conta_corrente_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa        uuid := public.current_empresa_id();
  v_saldo_inicial  numeric;
  v_creditos       numeric;
  v_debitos        numeric;
  v_saldo_final    numeric;
  v_creditos_nc    numeric;
  v_debitos_nc     numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria', 'view');

  IF p_conta_corrente_id IS NULL THEN
    RAISE EXCEPTION 'p_conta_corrente_id é obrigatório para o resumo de extrato.';
  END IF;

  SELECT e.saldo_apos_lancamento
  INTO v_saldo_inicial
  FROM public.financeiro_extratos_bancarios e
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND (p_start_date IS NOT NULL AND e.data_lancamento < p_start_date)
  ORDER BY e.data_lancamento DESC, e.created_at DESC, e.id DESC
  LIMIT 1;

  IF v_saldo_inicial IS NULL THEN
    SELECT cc.saldo_inicial
    INTO v_saldo_inicial
    FROM public.financeiro_contas_correntes cc
    WHERE cc.id = p_conta_corrente_id
      AND cc.empresa_id = v_empresa;

    v_saldo_inicial := COALESCE(v_saldo_inicial, 0);
  END IF;

  SELECT COALESCE(SUM(e.valor),0)
  INTO v_creditos
  FROM public.financeiro_extratos_bancarios e
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND e.tipo_lancamento = 'credito'
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date);

  SELECT COALESCE(SUM(e.valor),0)
  INTO v_debitos
  FROM public.financeiro_extratos_bancarios e
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND e.tipo_lancamento = 'debito'
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date);

  -- Não conciliados: excluir ignorados (eles não devem poluir o pendente)
  SELECT COALESCE(SUM(e.valor),0)
  INTO v_creditos_nc
  FROM public.financeiro_extratos_bancarios e
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND e.tipo_lancamento = 'credito'
    AND e.conciliado = false
    AND e.ignorado = false
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date);

  SELECT COALESCE(SUM(e.valor),0)
  INTO v_debitos_nc
  FROM public.financeiro_extratos_bancarios e
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND e.tipo_lancamento = 'debito'
    AND e.conciliado = false
    AND e.ignorado = false
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date);

  v_saldo_final := COALESCE(v_saldo_inicial,0) + COALESCE(v_creditos,0) - COALESCE(v_debitos,0);

  RETURN jsonb_build_object(
    'ok', true,
    'saldo_inicial', COALESCE(v_saldo_inicial,0),
    'creditos', COALESCE(v_creditos,0),
    'debitos', COALESCE(v_debitos,0),
    'saldo_final', COALESCE(v_saldo_final,0),
    'creditos_nao_conciliados', COALESCE(v_creditos_nc,0),
    'debitos_nao_conciliados', COALESCE(v_debitos_nc,0)
  );
END;
$$;

-- ============================================================================
-- 7. Update: financeiro_extratos_bancarios_vincular_movimentacao
--    Limpar ignorado ao conciliar
-- ============================================================================
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
  PERFORM public.require_permission_for_current_user('tesouraria','manage');

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
      conciliado = true,
      ignorado = false,
      motivo_ignorado = NULL,
      ignorado_at = NULL,
      ignorado_por = NULL
  WHERE id = v_extrato.id;

  UPDATE public.financeiro_movimentacoes
  SET conciliado = true
  WHERE id = v_mov.id;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
END;
$$;
