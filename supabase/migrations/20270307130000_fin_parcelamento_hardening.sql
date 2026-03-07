/*
  FIN: Parcelamento — hardening de permissões
  Adiciona guards de permission em ambas as RPCs criadas em 20270307120000,
  para passar o gate verify_financeiro_rpc_first.sql.
*/

BEGIN;

-- =============================================================================
-- RPC: financeiro_parcelamento_get_for_conta (read — view)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.financeiro_parcelamento_get_for_conta(
  p_conta_pagar_id   uuid DEFAULT NULL,
  p_conta_receber_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa         uuid := public.current_empresa_id();
  v_parcelamento_id uuid;
  v_numero_parcela  int;
  v_total_parcelas  int;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada no contexto atual.' USING errcode = '42501';
  END IF;

  -- Permission guard: requer view em contas_a_pagar ou contas_a_receber
  IF NOT (
    public.has_permission_for_current_user('contas_a_pagar', 'view')
    OR public.has_permission_for_current_user('contas_a_receber', 'view')
  ) THEN
    PERFORM public.require_permission_for_current_user('contas_a_pagar', 'view');
  END IF;

  IF p_conta_pagar_id IS NULL AND p_conta_receber_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Localizar a parcela pelo id da conta vinculada
  SELECT p.parcelamento_id, p.numero_parcela
    INTO v_parcelamento_id, v_numero_parcela
    FROM public.financeiro_parcelamentos_parcelas p
    JOIN public.financeiro_parcelamentos par
      ON par.id = p.parcelamento_id
     AND par.empresa_id = v_empresa
   WHERE p.empresa_id = v_empresa
     AND (
           (p_conta_pagar_id   IS NOT NULL AND p.conta_pagar_id   = p_conta_pagar_id)
        OR (p_conta_receber_id IS NOT NULL AND p.conta_receber_id = p_conta_receber_id)
         )
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Total de parcelas no parcelamento
  SELECT count(*)::int INTO v_total_parcelas
    FROM public.financeiro_parcelamentos_parcelas
   WHERE parcelamento_id = v_parcelamento_id
     AND empresa_id = v_empresa;

  RETURN jsonb_build_object(
    'parcelamento_id',  v_parcelamento_id,
    'numero_parcela',   v_numero_parcela,
    'total_parcelas',   v_total_parcelas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_parcelamento_get_for_conta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_parcelamento_get_for_conta(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- RPC: financeiro_parcelamento_apply_update (write — update)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.financeiro_parcelamento_apply_update(
  p_parcelamento_id uuid,
  p_patch           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa            uuid := public.current_empresa_id();
  v_par                record;
  v_parcela            record;
  v_total_parcelas     int;
  v_updated            int := 0;
  v_rows               int;

  -- campos do patch
  v_descricao          text;
  v_base_descricao     text;
  v_new_descricao      text;
  v_documento_ref      text;
  v_categoria          text;
  v_forma_pagamento    text;
  v_observacoes        text;
  v_fornecedor_id      uuid;
  v_cliente_id         uuid;
  v_centro_de_custo_id uuid;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada no contexto atual.' USING errcode = '42501';
  END IF;

  -- Verificar existência e propriedade do parcelamento
  SELECT * INTO v_par
    FROM public.financeiro_parcelamentos
   WHERE id = p_parcelamento_id
     AND empresa_id = v_empresa;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcelamento não encontrado.' USING errcode = 'P0002';
  END IF;

  -- Permission guard: requer update na entidade correta do parcelamento
  IF v_par.tipo::text = 'pagar' THEN
    PERFORM public.require_permission_for_current_user('contas_a_pagar', 'update');
  ELSE
    PERFORM public.require_permission_for_current_user('contas_a_receber', 'update');
  END IF;

  -- Total de parcelas (para rebuild do sufixo)
  SELECT count(*)::int INTO v_total_parcelas
    FROM public.financeiro_parcelamentos_parcelas
   WHERE parcelamento_id = p_parcelamento_id
     AND empresa_id = v_empresa;

  -- Extrair campos do patch (somente allowlist)
  v_descricao          := p_patch->>'descricao';
  v_documento_ref      := p_patch->>'documento_ref';
  v_categoria          := p_patch->>'categoria';
  v_forma_pagamento    := p_patch->>'forma_pagamento';
  v_observacoes        := p_patch->>'observacoes';
  v_fornecedor_id      := nullif(p_patch->>'fornecedor_id', '')::uuid;
  v_cliente_id         := nullif(p_patch->>'cliente_id', '')::uuid;
  v_centro_de_custo_id := nullif(p_patch->>'centro_de_custo_id', '')::uuid;

  -- Remover sufixo " (n/total)" existente da descrição base
  IF v_descricao IS NOT NULL THEN
    v_base_descricao := regexp_replace(v_descricao, ' \(\d+/\d+\)$', '');
  END IF;

  -- Iterar parcelas em ordem e atualizar as contas abertas vinculadas
  FOR v_parcela IN
    SELECT p.*
      FROM public.financeiro_parcelamentos_parcelas p
     WHERE p.parcelamento_id = p_parcelamento_id
       AND p.empresa_id = v_empresa
     ORDER BY p.numero_parcela
  LOOP
    -- Montar descrição por parcela (preserva numeração)
    IF v_base_descricao IS NOT NULL THEN
      v_new_descricao := CASE
        WHEN v_total_parcelas > 1
          THEN format('%s (%s/%s)', v_base_descricao, v_parcela.numero_parcela, v_total_parcelas)
        ELSE v_base_descricao
      END;
    ELSE
      v_new_descricao := NULL;
    END IF;

    -- Atualizar conta a pagar (somente status aberta/parcial)
    IF v_parcela.conta_pagar_id IS NOT NULL THEN
      UPDATE public.financeiro_contas_pagar SET
        descricao          = COALESCE(v_new_descricao,                               descricao),
        documento_ref      = CASE WHEN p_patch ? 'documento_ref'   THEN v_documento_ref   ELSE documento_ref   END,
        categoria          = CASE WHEN p_patch ? 'categoria'       THEN v_categoria       ELSE categoria       END,
        forma_pagamento    = CASE WHEN p_patch ? 'forma_pagamento' THEN v_forma_pagamento ELSE forma_pagamento END,
        observacoes        = CASE WHEN p_patch ? 'observacoes'     THEN v_observacoes     ELSE observacoes     END,
        fornecedor_id      = COALESCE(v_fornecedor_id,                               fornecedor_id),
        centro_de_custo_id = COALESCE(v_centro_de_custo_id,                         centro_de_custo_id)
      WHERE id = v_parcela.conta_pagar_id
        AND empresa_id = v_empresa
        AND status IN ('aberta', 'parcial');

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_updated := v_updated + v_rows;
    END IF;

    -- Atualizar conta a receber (somente status pendente/vencido)
    IF v_parcela.conta_receber_id IS NOT NULL THEN
      UPDATE public.contas_a_receber SET
        descricao          = COALESCE(v_new_descricao,       descricao),
        observacoes        = CASE WHEN p_patch ? 'observacoes'     THEN v_observacoes     ELSE observacoes     END,
        cliente_id         = COALESCE(v_cliente_id,          cliente_id),
        centro_de_custo_id = COALESCE(v_centro_de_custo_id, centro_de_custo_id)
      WHERE id = v_parcela.conta_receber_id
        AND empresa_id = v_empresa
        AND status IN ('pendente', 'vencido');

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_updated := v_updated + v_rows;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',               true,
    'updated_accounts', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_parcelamento_apply_update(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_parcelamento_apply_update(uuid, jsonb) TO authenticated, service_role;

COMMIT;
