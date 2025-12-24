-- =============================================================================
-- NF-e: persistir número de pedido do cliente (opcional) no cabeçalho do import
-- - Armazena p_payload->>'pedido_numero' em fiscal_nfe_imports.pedido_numero
-- =============================================================================
BEGIN;

ALTER TABLE public.fiscal_nfe_imports
  ADD COLUMN IF NOT EXISTS pedido_numero text;

-- Recria RPC para também salvar/atualizar pedido_numero
DROP FUNCTION IF EXISTS public.fiscal_nfe_import_register(jsonb);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_import_register(
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp     uuid := public.current_empresa_id();
  v_id      uuid;
  v_chave   text := trim(coalesce(p_payload->>'chave_acesso',''));
  v_items   jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_it      jsonb;
BEGIN
  IF v_chave = '' THEN
    RAISE EXCEPTION 'chave_acesso é obrigatória.';
  END IF;

  -- upsert do cabeçalho por (empresa, chave)
  INSERT INTO public.fiscal_nfe_imports (
    empresa_id,
    origem_upload,
    chave_acesso,
    numero,
    serie,
    emitente_cnpj,
    emitente_nome,
    destinat_cnpj,
    destinat_nome,
    data_emissao,
    total_produtos,
    total_nf,
    xml_raw,
    status,
    last_error,
    pedido_numero
  ) VALUES (
    v_emp,
    COALESCE(p_payload->>'origem_upload','xml'),
    v_chave,
    p_payload->>'numero',
    p_payload->>'serie',
    p_payload->>'emitente_cnpj',
    p_payload->>'emitente_nome',
    p_payload->>'destinat_cnpj',
    p_payload->>'destinat_nome',
    (p_payload->>'data_emissao')::timestamptz,
    (p_payload->>'total_produtos')::numeric,
    (p_payload->>'total_nf')::numeric,
    p_payload->>'xml_raw',
    'registrado',
    NULL,
    NULLIF(p_payload->>'pedido_numero','')
  )
  ON CONFLICT (empresa_id, chave_acesso) DO UPDATE SET
    origem_upload  = excluded.origem_upload,
    numero         = excluded.numero,
    serie          = excluded.serie,
    emitente_cnpj  = excluded.emitente_cnpj,
    emitente_nome  = excluded.emitente_nome,
    destinat_cnpj  = excluded.destinat_cnpj,
    destinat_nome  = excluded.destinat_nome,
    data_emissao   = excluded.data_emissao,
    total_produtos = excluded.total_produtos,
    total_nf       = excluded.total_nf,
    xml_raw        = excluded.xml_raw,
    status         = 'registrado',
    last_error     = NULL,
    pedido_numero  = excluded.pedido_numero,
    updated_at     = now()
  RETURNING id INTO v_id;

  -- Recarrega itens (estratégia simples: limpa e insere)
  DELETE FROM public.fiscal_nfe_import_items
  WHERE empresa_id = v_emp
    AND import_id  = v_id;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    INSERT INTO public.fiscal_nfe_import_items (
      empresa_id, import_id, n_item, cprod, ean, xprod, ncm, cfop,
      ucom, qcom, vuncom, vprod, cst, utrib, qtrib, vuntrib
    ) VALUES (
      v_emp, v_id,
      (v_it->>'n_item')::int,
      v_it->>'cprod',
      v_it->>'ean',
      v_it->>'xprod',
      v_it->>'ncm',
      v_it->>'cfop',
      v_it->>'ucom',
      (v_it->>'qcom')::numeric,
      (v_it->>'vuncom')::numeric,
      (v_it->>'vprod')::numeric,
      v_it->>'cst',
      v_it->>'utrib',
      (v_it->>'qtrib')::numeric,
      (v_it->>'vuntrib')::numeric
    );
  END LOOP;

  PERFORM pg_notify('app_log', '[RPC] fiscal_nfe_import_register: '||v_id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_import_register FROM public;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_import_register TO authenticated, service_role;

COMMIT;

