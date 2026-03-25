/*
  # Faturamento Mensal: RPCs de batch para emissão de boletos em lote

  ## Descrição
  Adiciona coluna cobranca_bancaria_id ao billing_schedule e cria
  RPCs batch_list e batch_prepare para o fluxo de faturamento mensal
  de contratos de serviço com emissão de boletos via Banco Inter.

  ## Impact Summary
  - Idempotente: CREATE OR REPLACE + IF NOT EXISTS + ON CONFLICT DO NOTHING
  - Sem breaking changes: coluna nullable + novas funções
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Link direto schedule → cobrança bancária
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.servicos_contratos_billing_schedule
  ADD COLUMN IF NOT EXISTS cobranca_bancaria_id uuid
  REFERENCES public.financeiro_cobrancas_bancarias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_svc_billing_schedule_cobranca_bancaria
  ON public.servicos_contratos_billing_schedule(cobranca_bancaria_id)
  WHERE cobranca_bancaria_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. batch_list: consulta read-only do estado do mês
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.servicos_contratos_billing_batch_list(
  p_competencia date
)
RETURNS TABLE(
  contrato_id        uuid,
  contrato_numero    text,
  contrato_descricao text,
  cliente_id         uuid,
  cliente_nome       text,
  cliente_email      text,
  schedule_id        uuid,
  competencia        date,
  data_vencimento    date,
  valor              numeric,
  conta_receber_id   uuid,
  cobranca_bancaria_id uuid,
  cobranca_status    text,
  inter_codigo_solicitacao text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_comp    date := date_trunc('month', p_competencia)::date;
BEGIN
  PERFORM public.require_permission_for_current_user('servicos', 'view');

  RETURN QUERY
  SELECT
    c.id              AS contrato_id,
    c.numero          AS contrato_numero,
    c.descricao       AS contrato_descricao,
    c.cliente_id      AS cliente_id,
    pe.nome           AS cliente_nome,
    pe.email          AS cliente_email,
    s.id              AS schedule_id,
    s.competencia     AS competencia,
    s.data_vencimento AS data_vencimento,
    s.valor           AS valor,
    s.conta_a_receber_id AS conta_receber_id,
    s.cobranca_bancaria_id AS cobranca_bancaria_id,
    cb.status         AS cobranca_status,
    cb.inter_codigo_solicitacao AS inter_codigo_solicitacao
  FROM public.servicos_contratos c
  JOIN public.servicos_contratos_billing_rules r
    ON r.contrato_id = c.id
    AND r.empresa_id = v_empresa
    AND r.ativo = true
  JOIN public.servicos_contratos_billing_schedule s
    ON s.contrato_id = c.id
    AND s.empresa_id = v_empresa
    AND s.competencia = v_comp
    AND s.kind = 'mensal'
  JOIN public.pessoas pe
    ON pe.id = c.cliente_id
  LEFT JOIN public.financeiro_cobrancas_bancarias cb
    ON cb.id = s.cobranca_bancaria_id
  WHERE c.empresa_id = v_empresa
    AND c.status = 'ativo'
  ORDER BY pe.nome, c.numero;
END;
$fn$;

REVOKE ALL ON FUNCTION public.servicos_contratos_billing_batch_list(date) FROM public;
GRANT EXECUTE ON FUNCTION public.servicos_contratos_billing_batch_list(date)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. batch_prepare: gera schedule + CR + cobrança bancária
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.servicos_contratos_billing_batch_prepare(
  p_competencia  date,
  p_contrato_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  contrato_id        uuid,
  contrato_numero    text,
  contrato_descricao text,
  cliente_id         uuid,
  cliente_nome       text,
  cliente_email      text,
  schedule_id        uuid,
  competencia        date,
  data_vencimento    date,
  valor              numeric,
  conta_receber_id   uuid,
  cobranca_bancaria_id uuid,
  cobranca_status    text,
  inter_codigo_solicitacao text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_comp    date := date_trunc('month', p_competencia)::date;
  v_until   date := (v_comp + interval '1 month' - interval '1 day')::date;
  v_rec     record;
  v_sched   record;
  v_cob_id  uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('servicos', 'update');
  PERFORM public.require_permission_for_current_user('contas_a_receber', 'create');

  -- Phase 1: gera schedule + receivables para cada contrato ativo
  FOR v_rec IN
    SELECT c.id
    FROM public.servicos_contratos c
    JOIN public.servicos_contratos_billing_rules r
      ON r.contrato_id = c.id AND r.empresa_id = v_empresa AND r.ativo = true
    WHERE c.empresa_id = v_empresa
      AND c.status = 'ativo'
      AND c.cliente_id IS NOT NULL
      AND (p_contrato_ids IS NULL OR c.id = ANY(p_contrato_ids))
  LOOP
    -- generate_receivables já chama generate_schedule internamente
    PERFORM public.servicos_contratos_billing_generate_receivables(v_rec.id, v_until);
  END LOOP;

  -- Phase 2: cria cobrança bancária para os schedule entries deste mês
  FOR v_sched IN
    SELECT
      s.id              AS schedule_id,
      s.conta_a_receber_id,
      s.cobranca_bancaria_id,
      s.valor,
      s.data_vencimento,
      c.numero          AS contrato_numero,
      c.cliente_id
    FROM public.servicos_contratos_billing_schedule s
    JOIN public.servicos_contratos c
      ON c.id = s.contrato_id AND c.empresa_id = v_empresa
    WHERE s.empresa_id = v_empresa
      AND s.competencia = v_comp
      AND s.kind = 'mensal'
      AND s.conta_a_receber_id IS NOT NULL
      AND s.cobranca_bancaria_id IS NULL
      AND (p_contrato_ids IS NULL OR s.contrato_id = ANY(p_contrato_ids))
  LOOP
    -- Verifica se já existe cobrança bancária para este CR
    SELECT cb.id INTO v_cob_id
    FROM public.financeiro_cobrancas_bancarias cb
    WHERE cb.empresa_id = v_empresa
      AND cb.conta_receber_id = v_sched.conta_a_receber_id
    LIMIT 1;

    IF v_cob_id IS NULL THEN
      INSERT INTO public.financeiro_cobrancas_bancarias (
        empresa_id, conta_receber_id, cliente_id,
        documento_ref, descricao, tipo_cobranca,
        valor_original, valor_atual,
        data_emissao, data_vencimento,
        status, origem_tipo, origem_id, provider
      ) VALUES (
        v_empresa,
        v_sched.conta_a_receber_id,
        v_sched.cliente_id,
        coalesce(v_sched.contrato_numero, left(v_sched.schedule_id::text, 15)),
        format('Contrato %s - %s',
          coalesce(v_sched.contrato_numero, '(s/n)'),
          to_char(v_comp, 'MM/YYYY')),
        'boleto',
        coalesce(v_sched.valor, 0),
        coalesce(v_sched.valor, 0),
        current_date,
        v_sched.data_vencimento,
        'pendente_emissao',
        'SERVICO_CONTRATO_SCHEDULE',
        v_sched.schedule_id,
        'inter'
      )
      RETURNING id INTO v_cob_id;

      INSERT INTO public.financeiro_cobrancas_bancarias_eventos (
        empresa_id, cobranca_id, tipo_evento, status_novo, mensagem
      ) VALUES (
        v_empresa, v_cob_id, 'criacao', 'pendente_emissao',
        format('Cobrança criada — faturamento mensal contrato %s, %s',
          coalesce(v_sched.contrato_numero, '(s/n)'),
          to_char(v_comp, 'MM/YYYY'))
      );
    END IF;

    UPDATE public.servicos_contratos_billing_schedule
    SET cobranca_bancaria_id = v_cob_id
    WHERE id = v_sched.schedule_id
      AND empresa_id = v_empresa;
  END LOOP;

  -- Retorna a lista completa do mês
  RETURN QUERY
  SELECT * FROM public.servicos_contratos_billing_batch_list(p_competencia);
END;
$fn$;

REVOKE ALL ON FUNCTION public.servicos_contratos_billing_batch_prepare(date, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.servicos_contratos_billing_batch_prepare(date, uuid[])
  TO authenticated, service_role;
