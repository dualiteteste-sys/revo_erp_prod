/*
  FIN-02 / FIN-04 / CFG-03 / GL-03: hardening + integrações (idempotente)

  - FIN-02:
    - Cancelar Conta a Pagar (aberta/parcial)
    - Estornar pagamento (paga/parcial) com movimentação inversa
  - FIN-04:
    - Gerar Conta a Pagar a partir de Compras (compras_pedidos) e Recebimentos (recebimentos/fiscal_nfe_imports)
    - Prevenir duplicidade por (empresa_id, origem_tipo, origem_id)
  - Hardening:
    - Índice único (best-effort) para idempotência em financeiro_movimentacoes por origem
    - Ajuste em estorno de Contas a Receber para permitir novo recebimento após estorno (mantendo trilha)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Financeiro: origem em Contas a Pagar (idempotente)
-- -----------------------------------------------------------------------------
ALTER TABLE public.financeiro_contas_pagar
  ADD COLUMN IF NOT EXISTS origem_tipo text,
  ADD COLUMN IF NOT EXISTS origem_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS financeiro_contas_pagar_origem_unique
  ON public.financeiro_contas_pagar (empresa_id, origem_tipo, origem_id)
  WHERE origem_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Hardening: idempotência de movimentações por origem (best-effort)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.financeiro_movimentacoes') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'financeiro_movimentacoes_origem_unique'
  ) THEN
    RETURN;
  END IF;

  -- Só cria índice único se não houver duplicatas que o invalidem.
  IF EXISTS (
    SELECT 1
    FROM public.financeiro_movimentacoes m
    WHERE m.origem_tipo IS NOT NULL
      AND m.origem_id IS NOT NULL
    GROUP BY m.empresa_id, m.origem_tipo, m.origem_id
    HAVING COUNT(*) > 1
    LIMIT 1
  ) THEN
    RAISE NOTICE 'Skipping financeiro_movimentacoes_origem_unique due to duplicates (keeping current behavior).';
    RETURN;
  END IF;

  EXECUTE '
    CREATE UNIQUE INDEX financeiro_movimentacoes_origem_unique
      ON public.financeiro_movimentacoes (empresa_id, origem_tipo, origem_id)
      WHERE origem_tipo IS NOT NULL AND origem_id IS NOT NULL
  ';
END $$;

-- -----------------------------------------------------------------------------
-- 3) FIN-02: Cancelar / Estornar Conta a Pagar
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financeiro_conta_pagar_cancelar(
  p_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_pagar','update');

  SELECT * INTO rec
  FROM public.financeiro_contas_pagar
  WHERE id = p_id
    AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar][cancelar] Conta a pagar não encontrada.' USING errcode = 'P0001';
  END IF;

  IF rec.status = 'paga' THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar][cancelar] Conta paga não pode ser cancelada. Use estorno.' USING errcode = 'P0001';
  END IF;

  UPDATE public.financeiro_contas_pagar
     SET status = 'cancelada',
         observacoes = CASE
           WHEN COALESCE(NULLIF(BTRIM(p_motivo), ''), '') = '' THEN observacoes
           WHEN observacoes IS NULL OR BTRIM(observacoes) = '' THEN '[CANCELAMENTO] ' || BTRIM(p_motivo)
           ELSE observacoes || E'\n' || '[CANCELAMENTO] ' || BTRIM(p_motivo)
         END,
         updated_at = now()
   WHERE id = rec.id
     AND empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_pagar_cancelar(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_pagar_cancelar(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_pagar_estornar_v2(
  p_id uuid,
  p_data_estorno date DEFAULT NULL,
  p_conta_corrente_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_mov public.financeiro_movimentacoes;
  v_data date := COALESCE(p_data_estorno, current_date);
  v_cc_id uuid;
  v_valor numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_pagar','update');
  PERFORM public.require_permission_for_current_user('tesouraria','create');

  SELECT * INTO rec
  FROM public.financeiro_contas_pagar
  WHERE id = p_id
    AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar][estornar] Conta a pagar não encontrada.' USING errcode = 'P0001';
  END IF;

  IF COALESCE(rec.valor_pago, 0) <= 0 THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar][estornar] Esta conta não possui pagamento registrado.' USING errcode = 'P0001';
  END IF;

  -- Movimento original (pagamento)
  SELECT * INTO v_mov
  FROM public.financeiro_movimentacoes m
  WHERE m.empresa_id = v_empresa
    AND m.origem_tipo = 'conta_a_pagar'
    AND m.origem_id = rec.id
  LIMIT 1;

  IF v_mov.id IS NOT NULL AND COALESCE(v_mov.conciliado, false) = true THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' USING errcode = 'P0001';
  END IF;

  v_cc_id := COALESCE(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));
  v_valor := COALESCE(rec.valor_pago, (rec.valor_total + rec.multa + rec.juros - rec.desconto));

  -- Mantém trilha e permite novo pagamento após estorno: "desencaixa" a origem do pagamento anterior
  IF v_mov.id IS NOT NULL THEN
    UPDATE public.financeiro_movimentacoes
       SET origem_tipo = 'conta_a_pagar_pagamento_estornado',
           observacoes = CASE
             WHEN COALESCE(NULLIF(BTRIM(p_motivo), ''), '') = '' THEN observacoes
             WHEN observacoes IS NULL OR BTRIM(observacoes) = '' THEN '[ESTORNO] ' || BTRIM(p_motivo)
             ELSE observacoes || E'\n' || '[ESTORNO] ' || BTRIM(p_motivo)
           END,
           updated_at = now()
     WHERE id = v_mov.id
       AND empresa_id = v_empresa
       AND COALESCE(conciliado, false) = false;
  END IF;

  -- Reabre a conta
  UPDATE public.financeiro_contas_pagar
     SET status = 'aberta',
         data_pagamento = NULL,
         valor_pago = 0,
         observacoes = CASE
           WHEN COALESCE(NULLIF(BTRIM(p_motivo), ''), '') = '' THEN observacoes
           WHEN observacoes IS NULL OR BTRIM(observacoes) = '' THEN '[ESTORNO] ' || BTRIM(p_motivo)
           ELSE observacoes || E'\n' || '[ESTORNO] ' || BTRIM(p_motivo)
         END,
         updated_at = now()
   WHERE id = rec.id
     AND empresa_id = v_empresa;

  -- Movimentação inversa (entrada)
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
      WHEN rec.descricao IS NULL OR BTRIM(rec.descricao) = '' THEN 'Estorno de pagamento'
      ELSE 'Estorno: ' || rec.descricao
    END,
    rec.documento_ref,
    'conta_a_pagar_estorno',
    rec.id,
    rec.categoria,
    rec.centro_custo,
    false,
    NULLIF(BTRIM(p_motivo), '')
  )
  ON CONFLICT (empresa_id, origem_tipo, origem_id)
    WHERE origem_tipo IS NOT NULL AND origem_id IS NOT NULL
  DO NOTHING;

  RETURN public.financeiro_contas_pagar_get(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_pagar_estornar_v2(uuid, date, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_pagar_estornar_v2(uuid, date, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_pagar_estornar(
  p_id uuid,
  p_data_estorno date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.financeiro_conta_pagar_estornar_v2(p_id, p_data_estorno, NULL, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_pagar_estornar(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_pagar_estornar(uuid, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) FIN-04: Gerar Conta a Pagar por origem (Compras / Recebimentos)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_pagar_from_compra_get(p_compra_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT cp.id
  FROM public.financeiro_contas_pagar cp
  WHERE cp.empresa_id = public.current_empresa_id()
    AND cp.origem_tipo = 'COMPRA'
    AND cp.origem_id = p_compra_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_pagar_from_compra_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_pagar_from_compra_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_pagar_from_compra_create(
  p_compra_id uuid,
  p_data_vencimento date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_compra public.compras_pedidos;
  v_existing uuid;
  v_due date := COALESCE(p_data_vencimento, (current_date + 7));
  v_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_pagar','create');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][COMPRA] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  SELECT * INTO v_compra
  FROM public.compras_pedidos c
  WHERE c.id = p_compra_id
    AND c.empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][COMPRA] Pedido de compra não encontrado' USING errcode = 'P0002';
  END IF;

  IF v_compra.status <> 'recebido'::public.status_compra THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][COMPRA] A compra precisa estar recebida para gerar a conta a pagar.' USING errcode = '23514';
  END IF;

  IF v_compra.fornecedor_id IS NULL THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][COMPRA] Compra sem fornecedor vinculado.' USING errcode = '23514';
  END IF;

  SELECT public.financeiro_conta_a_pagar_from_compra_get(p_compra_id) INTO v_existing;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  BEGIN
    INSERT INTO public.financeiro_contas_pagar (
      empresa_id,
      fornecedor_id,
      documento_ref,
      descricao,
      data_emissao,
      data_vencimento,
      valor_total,
      valor_pago,
      status,
      observacoes,
      origem_tipo,
      origem_id
    ) VALUES (
      v_empresa,
      v_compra.fornecedor_id,
      ('OC-' || v_compra.numero::text),
      ('Ordem de Compra #' || v_compra.numero::text),
      COALESCE(v_compra.data_emissao, current_date),
      v_due,
      COALESCE(v_compra.total_geral, 0),
      0,
      'aberta',
      'Gerado automaticamente a partir de Compra recebida.',
      'COMPRA',
      p_compra_id
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT cp.id INTO v_id
      FROM public.financeiro_contas_pagar cp
      WHERE cp.empresa_id = v_empresa
        AND cp.origem_tipo = 'COMPRA'
        AND cp.origem_id = p_compra_id
      LIMIT 1;
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_pagar_from_compra_create(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_pagar_from_compra_create(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_pagar_from_recebimento_get(p_recebimento_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT cp.id
  FROM public.financeiro_contas_pagar cp
  WHERE cp.empresa_id = public.current_empresa_id()
    AND cp.origem_tipo = 'RECEBIMENTO'
    AND cp.origem_id = p_recebimento_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_pagar_from_recebimento_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_pagar_from_recebimento_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_pagar_from_recebimento_create(
  p_recebimento_id uuid,
  p_data_vencimento date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_rec public.recebimentos;
  v_imp public.fiscal_nfe_imports;
  v_existing uuid;
  v_due date := COALESCE(p_data_vencimento, (current_date + 7));
  v_fornecedor_id uuid;
  v_nome text;
  v_doc text;
  v_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_pagar','create');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][RECEB] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  SELECT * INTO v_rec
  FROM public.recebimentos r
  WHERE r.id = p_recebimento_id
    AND r.empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][RECEB] Recebimento não encontrado' USING errcode = 'P0002';
  END IF;

  IF v_rec.status <> 'concluido' THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][RECEB] O recebimento precisa estar concluído para gerar a conta a pagar.' USING errcode = '23514';
  END IF;

  SELECT * INTO v_imp
  FROM public.fiscal_nfe_imports i
  WHERE i.id = v_rec.fiscal_nfe_import_id
    AND i.empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][RECEB] NF-e import não encontrada' USING errcode = 'P0002';
  END IF;

  SELECT public.financeiro_conta_a_pagar_from_recebimento_get(p_recebimento_id) INTO v_existing;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_doc := NULLIF(BTRIM(v_imp.emitente_cnpj), '');
  v_nome := COALESCE(NULLIF(BTRIM(v_imp.emitente_nome), ''), v_doc, 'Fornecedor');

  IF v_doc IS NULL THEN
    RAISE EXCEPTION '[FIN][A_PAGAR][RECEB] Emitente sem CNPJ/CPF (doc_unico).' USING errcode = '23514';
  END IF;

  -- Garante pessoa/fornecedor (best-effort)
  SELECT p.id INTO v_fornecedor_id
  FROM public.pessoas p
  WHERE p.empresa_id = v_empresa
    AND p.doc_unico = v_doc
  LIMIT 1;

  IF v_fornecedor_id IS NULL THEN
    INSERT INTO public.pessoas (empresa_id, nome, tipo, tipo_pessoa, doc_unico)
    VALUES (v_empresa, v_nome, 'fornecedor'::public.pessoa_tipo, 'juridica'::public.tipo_pessoa_enum, v_doc)
    RETURNING id INTO v_fornecedor_id;
  ELSE
    -- Se já existe como cliente, marca como "ambos" para não quebrar filtros
    UPDATE public.pessoas
       SET tipo = CASE WHEN tipo = 'cliente'::public.pessoa_tipo THEN 'ambos'::public.pessoa_tipo ELSE tipo END,
           updated_at = now()
     WHERE id = v_fornecedor_id
       AND empresa_id = v_empresa;
  END IF;

  BEGIN
    INSERT INTO public.financeiro_contas_pagar (
      empresa_id,
      fornecedor_id,
      documento_ref,
      descricao,
      data_emissao,
      data_vencimento,
      valor_total,
      valor_pago,
      status,
      observacoes,
      origem_tipo,
      origem_id
    ) VALUES (
      v_empresa,
      v_fornecedor_id,
      COALESCE(NULLIF(v_imp.numero,''), NULLIF(v_imp.chave_acesso,'')),
      ('NF-e ' || COALESCE(NULLIF(v_imp.numero,''), '') || '/' || COALESCE(NULLIF(v_imp.serie,''), '') || ' - ' || v_nome),
      COALESCE((v_imp.data_emissao::date), current_date),
      v_due,
      COALESCE(v_imp.total_nf, v_imp.total_produtos, 0),
      0,
      'aberta',
      'Gerado automaticamente a partir de Recebimento concluído.',
      'RECEBIMENTO',
      p_recebimento_id
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT cp.id INTO v_id
      FROM public.financeiro_contas_pagar cp
      WHERE cp.empresa_id = v_empresa
        AND cp.origem_tipo = 'RECEBIMENTO'
        AND cp.origem_id = p_recebimento_id
      LIMIT 1;
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_pagar_from_recebimento_create(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_pagar_from_recebimento_create(uuid, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) FIN-01 Hardening: estorno de contas a receber deve permitir novo recebimento
-- -----------------------------------------------------------------------------
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
  v_data date := COALESCE(p_data_estorno, current_date);
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

  -- Movimento original (baixa)
  SELECT * INTO v_mov
  FROM public.financeiro_movimentacoes m
  WHERE m.empresa_id = v_empresa
    AND m.origem_tipo = 'conta_a_receber'
    AND m.origem_id = rec.id
  LIMIT 1;

  IF v_mov.id IS NOT NULL AND COALESCE(v_mov.conciliado, false) = true THEN
    RAISE EXCEPTION '[FINANCEIRO][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' USING errcode = 'P0001';
  END IF;

  v_cc_id := COALESCE(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_valor := COALESCE(rec.valor_pago, rec.valor);

  -- "Desencaixa" a origem do pagamento anterior para permitir novo recebimento após estorno
  IF v_mov.id IS NOT NULL THEN
    UPDATE public.financeiro_movimentacoes
       SET origem_tipo = 'conta_a_receber_pagamento_estornado',
           observacoes = CASE
             WHEN COALESCE(NULLIF(BTRIM(p_motivo), ''), '') = '' THEN observacoes
             WHEN observacoes IS NULL OR BTRIM(observacoes) = '' THEN '[ESTORNO] ' || BTRIM(p_motivo)
             ELSE observacoes || E'\n' || '[ESTORNO] ' || BTRIM(p_motivo)
           END,
           updated_at = now()
     WHERE id = v_mov.id
       AND empresa_id = v_empresa
       AND COALESCE(conciliado, false) = false;
  END IF;

  -- Marca a conta como pendente novamente (remove baixa)
  UPDATE public.contas_a_receber
     SET status = 'pendente'::public.status_conta_receber,
         data_pagamento = NULL,
         valor_pago = NULL,
         observacoes = CASE
           WHEN COALESCE(NULLIF(BTRIM(p_motivo), ''), '') = '' THEN observacoes
           WHEN observacoes IS NULL OR BTRIM(observacoes) = '' THEN '[ESTORNO] ' || BTRIM(p_motivo)
           ELSE observacoes || E'\n' || '[ESTORNO] ' || BTRIM(p_motivo)
         END,
         updated_at = now()
   WHERE id = rec.id AND empresa_id = v_empresa
  RETURNING * INTO rec;

  -- Registra movimentação de estorno (saída) para manter trilha
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
      WHEN rec.descricao IS NULL OR BTRIM(rec.descricao) = '' THEN 'Estorno de recebimento'
      ELSE 'Estorno: ' || rec.descricao
    END,
    NULL,
    'conta_a_receber_estorno',
    rec.id,
    NULL,
    NULL,
    false,
    NULLIF(BTRIM(p_motivo), '')
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

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

