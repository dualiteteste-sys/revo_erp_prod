-- Phase 5a: Auto-create conta a pagar from confirmed NF-e destinada
BEGIN;

-- Helper to check if conta a pagar already exists for this NF-e destinada
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinada_conta_pagar_get(p_nfe_destinada_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT cp.id
  FROM public.financeiro_contas_pagar cp
  WHERE cp.empresa_id = public.current_empresa_id()
    AND cp.origem_tipo = 'NFE_DESTINADA'
    AND cp.origem_id = p_nfe_destinada_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_destinada_conta_pagar_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinada_conta_pagar_get(uuid) TO authenticated, service_role;

-- Main function: create conta a pagar from confirmed NF-e destinada
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinada_gerar_conta_pagar(
  p_nfe_destinada_id uuid,
  p_data_vencimento date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_nfe public.fiscal_nfe_destinadas;
  v_existing uuid;
  v_due date := COALESCE(p_data_vencimento, (current_date + 7));
  v_fornecedor_id uuid;
  v_nome text;
  v_doc text;
  v_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_pagar', 'create');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FISCAL][NFE_DEST][CONTA_PAGAR] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  -- Load NF-e destinada
  SELECT * INTO v_nfe
  FROM public.fiscal_nfe_destinadas n
  WHERE n.id = p_nfe_destinada_id
    AND n.empresa_id = v_empresa
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[FISCAL][NFE_DEST][CONTA_PAGAR] NF-e destinada não encontrada' USING errcode = 'P0002';
  END IF;

  -- Must be confirmed or at least ciencia
  IF v_nfe.status NOT IN ('confirmada', 'ciencia') THEN
    RAISE EXCEPTION '[FISCAL][NFE_DEST][CONTA_PAGAR] NF-e precisa estar confirmada ou com ciência para gerar conta a pagar.' USING errcode = '23514';
  END IF;

  -- Check if already exists (idempotent)
  SELECT public.fiscal_nfe_destinada_conta_pagar_get(p_nfe_destinada_id) INTO v_existing;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Fornecedor: find or create by CNPJ
  v_doc := NULLIF(BTRIM(v_nfe.cnpj_emitente), '');
  v_nome := COALESCE(NULLIF(BTRIM(v_nfe.nome_emitente), ''), v_doc, 'Fornecedor');

  IF v_doc IS NULL THEN
    RAISE EXCEPTION '[FISCAL][NFE_DEST][CONTA_PAGAR] Emitente sem CNPJ.' USING errcode = '23514';
  END IF;

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
    -- If exists as cliente, upgrade to ambos
    UPDATE public.pessoas
       SET tipo = CASE WHEN tipo = 'cliente'::public.pessoa_tipo THEN 'ambos'::public.pessoa_tipo ELSE tipo END,
           updated_at = now()
     WHERE id = v_fornecedor_id
       AND empresa_id = v_empresa;
  END IF;

  -- Create conta a pagar
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
      v_nfe.chave_acesso,
      'NF-e Recebida - ' || v_nome,
      COALESCE(v_nfe.data_emissao::date, current_date),
      v_due,
      COALESCE(v_nfe.valor_nf, 0),
      0,
      'aberta',
      'Gerado automaticamente a partir de NF-e Destinada confirmada.',
      'NFE_DESTINADA',
      p_nfe_destinada_id
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT cp.id INTO v_id
      FROM public.financeiro_contas_pagar cp
      WHERE cp.empresa_id = v_empresa
        AND cp.origem_tipo = 'NFE_DESTINADA'
        AND cp.origem_id = p_nfe_destinada_id
      LIMIT 1;
  END;

  -- Link back to NF-e destinada
  UPDATE public.fiscal_nfe_destinadas
  SET conta_pagar_id = v_id,
      fornecedor_id = v_fornecedor_id,
      updated_at = now()
  WHERE id = p_nfe_destinada_id
    AND empresa_id = v_empresa;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_destinada_gerar_conta_pagar(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinada_gerar_conta_pagar(uuid, date) TO authenticated, service_role;

COMMIT;
