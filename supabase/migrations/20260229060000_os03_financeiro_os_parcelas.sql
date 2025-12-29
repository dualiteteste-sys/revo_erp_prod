/*
  OS-03: Amarração OS ↔ Financeiro (parcelas)

  - Gera contas a receber por parcela (ordem_servico_parcelas) quando existir
  - Mantém idempotência via (empresa_id, origem_tipo, origem_id)
  - Sincroniza status das parcelas ao receber/estornar/cancelar a conta
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Gerar Contas a Receber por parcela
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_from_os_parcela_get(p_os_parcela_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT c.id
  FROM public.contas_a_receber c
  WHERE c.empresa_id = public.current_empresa_id()
    AND c.origem_tipo = 'OS_PARCELA'
    AND c.origem_id = p_os_parcela_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_from_os_parcela_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_from_os_parcela_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_from_os_parcela_create(
  p_os_parcela_id uuid
)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_parcela public.ordem_servico_parcelas;
  v_os public.ordem_servicos;
  v_existing uuid;
  v_rec public.contas_a_receber;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','create');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELA] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  IF to_regclass('public.ordem_servico_parcelas') IS NULL THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELA] Tabela de parcelas não encontrada' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_parcela
  FROM public.ordem_servico_parcelas p
  WHERE p.id = p_os_parcela_id
    AND p.empresa_id = v_empresa;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELA] Parcela não encontrada' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_os
  FROM public.ordem_servicos os
  WHERE os.id = v_parcela.ordem_servico_id
    AND os.empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELA] OS não encontrada' USING errcode = 'P0002';
  END IF;

  IF v_os.status <> 'concluida'::public.status_os THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELA] A OS precisa estar concluída para gerar contas a receber.' USING errcode = '23514';
  END IF;

  IF v_os.cliente_id IS NULL THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELA] A OS não possui cliente vinculado.' USING errcode = '23514';
  END IF;

  SELECT public.financeiro_conta_a_receber_from_os_parcela_get(p_os_parcela_id) INTO v_existing;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO v_rec
    FROM public.contas_a_receber c
    WHERE c.id = v_existing
      AND c.empresa_id = v_empresa;
    RETURN v_rec;
  END IF;

  BEGIN
    INSERT INTO public.contas_a_receber (
      empresa_id,
      cliente_id,
      descricao,
      valor,
      data_vencimento,
      status,
      data_pagamento,
      valor_pago,
      observacoes,
      origem_tipo,
      origem_id
    )
    VALUES (
      v_empresa,
      v_os.cliente_id,
      format('OS #%s • Parcela %s/%s', v_os.numero::text, v_parcela.numero_parcela::text, (
        SELECT count(*)::int FROM public.ordem_servico_parcelas px
        WHERE px.empresa_id = v_empresa AND px.ordem_servico_id = v_os.id
      )::text),
      coalesce(v_parcela.valor, 0),
      v_parcela.vencimento,
      CASE WHEN v_parcela.status = 'paga'::public.status_parcela THEN 'pago'::public.status_conta_receber ELSE 'pendente'::public.status_conta_receber END,
      CASE WHEN v_parcela.status = 'paga'::public.status_parcela THEN v_parcela.pago_em ELSE NULL END,
      CASE WHEN v_parcela.status = 'paga'::public.status_parcela THEN v_parcela.valor ELSE NULL END,
      'Gerado automaticamente a partir de parcelas da O.S.',
      'OS_PARCELA',
      v_parcela.id
    )
    RETURNING * INTO v_rec;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO v_rec
      FROM public.contas_a_receber c
      WHERE c.empresa_id = v_empresa
        AND c.origem_tipo = 'OS_PARCELA'
        AND c.origem_id = v_parcela.id
      LIMIT 1;
  END;

  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_from_os_parcela_create(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_from_os_parcela_create(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_a_receber_from_os_parcelas_create(
  p_os_id uuid
)
RETURNS SETOF public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_os public.ordem_servicos;
  v_parcela public.ordem_servico_parcelas;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','create');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  IF to_regclass('public.ordem_servico_parcelas') IS NULL THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] Tabela de parcelas não encontrada' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_os
  FROM public.ordem_servicos os
  WHERE os.id = p_os_id
    AND os.empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] OS não encontrada' USING errcode = 'P0002';
  END IF;

  IF v_os.status <> 'concluida'::public.status_os THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] A OS precisa estar concluída para gerar contas a receber.' USING errcode = '23514';
  END IF;

  IF v_os.cliente_id IS NULL THEN
    RAISE EXCEPTION '[FIN][A_RECEBER][OS_PARCELAS] A OS não possui cliente vinculado.' USING errcode = '23514';
  END IF;

  FOR v_parcela IN
    SELECT *
    FROM public.ordem_servico_parcelas p
    WHERE p.empresa_id = v_empresa
      AND p.ordem_servico_id = p_os_id
      AND p.status <> 'cancelada'::public.status_parcela
    ORDER BY p.numero_parcela
  LOOP
    PERFORM public.financeiro_conta_a_receber_from_os_parcela_create(v_parcela.id);
  END LOOP;

  RETURN QUERY
  SELECT c.*
  FROM public.contas_a_receber c
  JOIN public.ordem_servico_parcelas p ON p.id = c.origem_id
  WHERE c.empresa_id = v_empresa
    AND c.origem_tipo = 'OS_PARCELA'
    AND p.ordem_servico_id = p_os_id
  ORDER BY p.numero_parcela;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_a_receber_from_os_parcelas_create(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_a_receber_from_os_parcelas_create(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Sync parcela status com contas a receber (receber/estornar/cancelar)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_receber_v2(
  p_id uuid,
  p_data_pagamento date DEFAULT NULL,
  p_valor_pago numeric DEFAULT NULL,
  p_conta_corrente_id uuid DEFAULT NULL
)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_cc_id uuid;
  v_valor numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','update');
  PERFORM public.require_permission_for_current_user('tesouraria','create');

  SELECT *
    INTO rec
  FROM public.contas_a_receber
  WHERE id = p_id
    AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][receber] Conta a receber não encontrada.' USING errcode = 'P0001';
  END IF;

  IF rec.status = 'cancelado' THEN
    RAISE EXCEPTION '[FINANCEIRO][receber] Não é possível receber uma conta cancelada.' USING errcode = 'P0001';
  END IF;

  IF rec.status <> 'pago' THEN
    UPDATE public.contas_a_receber
    SET
      status = 'pago',
      data_pagamento = v_data,
      valor_pago = coalesce(p_valor_pago, rec.valor)
    WHERE id = rec.id
      AND empresa_id = v_empresa
    RETURNING * INTO rec;
  END IF;

  -- Se a conta vem de parcela da OS, marca parcela como paga (best-effort)
  IF rec.origem_tipo = 'OS_PARCELA' AND rec.origem_id IS NOT NULL AND to_regclass('public.ordem_servico_parcelas') IS NOT NULL THEN
    UPDATE public.ordem_servico_parcelas
       SET status = 'paga'::public.status_parcela,
           pago_em = coalesce(rec.data_pagamento, v_data),
           updated_at = now()
     WHERE id = rec.origem_id
       AND empresa_id = v_empresa;
  END IF;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_data := coalesce(rec.data_pagamento, v_data);
  v_valor := coalesce(rec.valor_pago, p_valor_pago, rec.valor);

  INSERT INTO public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) VALUES (
    v_empresa,
    v_cc_id,
    v_data,
    rec.data_vencimento,
    'entrada',
    v_valor,
    CASE
      WHEN rec.descricao IS NULL OR btrim(rec.descricao) = '' THEN 'Recebimento'
      ELSE 'Recebimento: ' || rec.descricao
    END,
    NULL,
    'conta_a_receber',
    rec.id,
    NULL,
    NULL,
    false,
    NULL
  )
  ON CONFLICT (empresa_id, origem_tipo, origem_id)
    WHERE origem_tipo IS NOT NULL AND origem_id IS NOT NULL
  DO NOTHING;

  PERFORM pg_notify('app_log', '[RPC] financeiro_conta_a_receber_receber_v2 ' || p_id);
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) TO authenticated, service_role;

-- Estornar: mantém trilha e reabre parcela (best-effort)
CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_estornar_v2(
  p_id uuid,
  p_data_estorno date DEFAULT NULL,
  p_conta_corrente_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_mov public.financeiro_movimentacoes;
  v_data date := coalesce(p_data_estorno, current_date);
  v_cc_id uuid;
  v_valor numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','update');
  PERFORM public.require_permission_for_current_user('tesouraria','create');

  SELECT * INTO rec
  FROM public.contas_a_receber
  WHERE id = p_id AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][estornar] Conta a receber não encontrada.' USING errcode = 'P0001';
  END IF;

  IF rec.status <> 'pago'::public.status_conta_receber THEN
    RAISE EXCEPTION '[FINANCEIRO][estornar] Somente contas pagas podem ser estornadas.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_mov
  FROM public.financeiro_movimentacoes m
  WHERE m.empresa_id = v_empresa
    AND m.origem_tipo = 'conta_a_receber'
    AND m.origem_id = rec.id
  LIMIT 1;

  IF v_mov.id IS NOT NULL AND coalesce(v_mov.conciliado, false) = true THEN
    RAISE EXCEPTION '[FINANCEIRO][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' USING errcode = 'P0001';
  END IF;

  v_cc_id := coalesce(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_valor := coalesce(rec.valor_pago, rec.valor);

  UPDATE public.contas_a_receber
     SET status = 'pendente'::public.status_conta_receber,
         data_pagamento = NULL,
         valor_pago = NULL,
         observacoes = CASE
           WHEN coalesce(nullif(btrim(p_motivo), ''), '') = '' THEN observacoes
           WHEN observacoes IS NULL OR btrim(observacoes) = '' THEN '[ESTORNO] ' || btrim(p_motivo)
           ELSE observacoes || E'\n' || '[ESTORNO] ' || btrim(p_motivo)
         END,
         updated_at = now()
   WHERE id = rec.id AND empresa_id = v_empresa
  RETURNING * INTO rec;

  IF rec.origem_tipo = 'OS_PARCELA' AND rec.origem_id IS NOT NULL AND to_regclass('public.ordem_servico_parcelas') IS NOT NULL THEN
    UPDATE public.ordem_servico_parcelas
       SET status = 'aberta'::public.status_parcela,
           pago_em = NULL,
           updated_at = now()
     WHERE id = rec.origem_id
       AND empresa_id = v_empresa;
  END IF;

  INSERT INTO public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) VALUES (
    v_empresa,
    v_cc_id,
    v_data,
    rec.data_vencimento,
    'saida',
    v_valor,
    CASE
      WHEN rec.descricao IS NULL OR btrim(rec.descricao) = '' THEN 'Estorno de recebimento'
      ELSE 'Estorno: ' || rec.descricao
    END,
    NULL,
    'conta_a_receber_estorno',
    rec.id,
    NULL,
    NULL,
    false,
    nullif(btrim(p_motivo), '')
  )
  ON CONFLICT (empresa_id, origem_tipo, origem_id)
    WHERE origem_tipo IS NOT NULL AND origem_id IS NOT NULL
  DO NOTHING;

  PERFORM pg_notify('app_log', '[RPC] financeiro_conta_a_receber_estornar_v2 ' || p_id);
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_estornar_v2(uuid, date, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_estornar_v2(uuid, date, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_cancelar(
  p_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','update');

  SELECT * INTO rec
  FROM public.contas_a_receber
  WHERE id = p_id AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][cancelar] Conta a receber não encontrada.' USING errcode = 'P0001';
  END IF;

  IF rec.status = 'pago'::public.status_conta_receber THEN
    RAISE EXCEPTION '[FINANCEIRO][cancelar] Conta está paga. Estorne o recebimento antes de cancelar.' USING errcode = 'P0001';
  END IF;

  UPDATE public.contas_a_receber
     SET status = 'cancelado'::public.status_conta_receber,
         observacoes = CASE
           WHEN coalesce(nullif(btrim(p_motivo), ''), '') = '' THEN observacoes
           WHEN observacoes IS NULL OR btrim(observacoes) = '' THEN '[CANCELADO] ' || btrim(p_motivo)
           ELSE observacoes || E'\n' || '[CANCELADO] ' || btrim(p_motivo)
         END,
         updated_at = now()
   WHERE id = rec.id AND empresa_id = v_empresa
  RETURNING * INTO rec;

  IF rec.origem_tipo = 'OS_PARCELA' AND rec.origem_id IS NOT NULL AND to_regclass('public.ordem_servico_parcelas') IS NOT NULL THEN
    UPDATE public.ordem_servico_parcelas
       SET status = 'cancelada'::public.status_parcela,
           observacoes = CASE
             WHEN coalesce(nullif(btrim(p_motivo), ''), '') = '' THEN observacoes
             WHEN observacoes IS NULL OR btrim(observacoes) = '' THEN '[CANCELADO] ' || btrim(p_motivo)
             ELSE observacoes || E'\n' || '[CANCELADO] ' || btrim(p_motivo)
           END,
           updated_at = now()
     WHERE id = rec.origem_id
       AND empresa_id = v_empresa;
  END IF;

  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_cancelar(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_cancelar(uuid, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

