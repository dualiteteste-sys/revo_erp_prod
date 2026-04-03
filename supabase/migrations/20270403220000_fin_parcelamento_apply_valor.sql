-- Adicionar suporte a propagação de valor_total/valor no parcelamento apply update.
-- Quando o usuário altera o valor de uma parcela e escolhe "todas as parcelas em aberto",
-- o novo valor é aplicado a todas as parcelas abertas.

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
  v_valor_total        numeric;
  v_valor              numeric;
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

  -- Total de parcelas (para rebuild do sufixo)
  SELECT count(*)::int INTO v_total_parcelas
    FROM public.financeiro_parcelamentos_parcelas
   WHERE parcelamento_id = p_parcelamento_id
     AND empresa_id = v_empresa;

  -- Extrair campos do patch (allowlist)
  v_descricao          := p_patch->>'descricao';
  v_documento_ref      := p_patch->>'documento_ref';
  v_categoria          := p_patch->>'categoria';
  v_forma_pagamento    := p_patch->>'forma_pagamento';
  v_observacoes        := p_patch->>'observacoes';
  v_fornecedor_id      := nullif(p_patch->>'fornecedor_id', '')::uuid;
  v_cliente_id         := nullif(p_patch->>'cliente_id', '')::uuid;
  v_centro_de_custo_id := nullif(p_patch->>'centro_de_custo_id', '')::uuid;
  v_valor_total        := CASE WHEN p_patch ? 'valor_total' THEN nullif(p_patch->>'valor_total', '')::numeric ELSE NULL END;
  v_valor              := CASE WHEN p_patch ? 'valor'       THEN nullif(p_patch->>'valor', '')::numeric       ELSE NULL END;

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
        centro_de_custo_id = COALESCE(v_centro_de_custo_id,                         centro_de_custo_id),
        valor_total        = CASE WHEN v_valor_total IS NOT NULL THEN v_valor_total ELSE valor_total END
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
        centro_de_custo_id = COALESCE(v_centro_de_custo_id, centro_de_custo_id),
        valor              = CASE WHEN v_valor IS NOT NULL THEN v_valor ELSE valor END
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
