/*
  P1.2 (RPC-first): Fiscal / NF-e emissões (rascunhos + itens + auditoria)
  - Remove escrita/leitura direta do client em tabelas sensíveis (fiscal_nfe_emissoes/itens/audit_timeline)
  - Fornece RPCs SECURITY DEFINER tenant-safe e com RBAC (member/admin)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Grants: bloquear acesso direto do client (RPC-only)
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.fiscal_nfe_emissoes FROM authenticated;
REVOKE ALL ON TABLE public.fiscal_nfe_emissao_itens FROM authenticated;
REVOKE ALL ON TABLE public.fiscal_nfe_audit_timeline FROM authenticated;

-- -----------------------------------------------------------------------------
-- 1) Listagem (member)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_emissoes_list(text, text, int);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissoes_list(
  p_status text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  status text,
  numero int,
  serie int,
  chave_acesso text,
  destinatario_pessoa_id uuid,
  destinatario_nome text,
  ambiente text,
  natureza_operacao text,
  valor_total numeric,
  total_produtos numeric,
  total_descontos numeric,
  total_frete numeric,
  total_impostos numeric,
  total_nfe numeric,
  payload jsonb,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_status text := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_q text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    e.id,
    e.status::text,
    e.numero,
    e.serie,
    e.chave_acesso,
    e.destinatario_pessoa_id,
    p.nome as destinatario_nome,
    e.ambiente::text,
    e.natureza_operacao,
    e.valor_total,
    e.total_produtos,
    e.total_descontos,
    e.total_frete,
    e.total_impostos,
    e.total_nfe,
    e.payload,
    e.last_error,
    e.created_at,
    e.updated_at
  FROM public.fiscal_nfe_emissoes e
  LEFT JOIN public.pessoas p ON p.id = e.destinatario_pessoa_id
  WHERE e.empresa_id = v_empresa
    AND (v_status IS NULL OR e.status::text = v_status)
    AND (
      v_q IS NULL OR (
        COALESCE(e.chave_acesso, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.nome, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.status::text, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.numero::text, '') ILIKE '%' || v_q || '%'
        OR COALESCE(e.serie::text, '') ILIKE '%' || v_q || '%'
      )
    )
  ORDER BY e.updated_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissoes_list(text, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissoes_list(text, text, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Itens do rascunho (member)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_itens_list(uuid);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_itens_list(
  p_emissao_id uuid
)
RETURNS TABLE(
  id uuid,
  produto_id uuid,
  descricao text,
  unidade text,
  quantidade numeric,
  valor_unitario numeric,
  valor_desconto numeric,
  ncm text,
  cfop text,
  cst text,
  csosn text,
  ordem int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    i.id,
    i.produto_id,
    i.descricao,
    i.unidade,
    i.quantidade,
    i.valor_unitario,
    i.valor_desconto,
    i.ncm,
    i.cfop,
    i.cst,
    i.csosn,
    i.ordem
  FROM public.fiscal_nfe_emissao_itens i
  WHERE i.empresa_id = v_empresa
    AND i.emissao_id = p_emissao_id
  ORDER BY i.ordem ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_itens_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_itens_list(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Auditoria (member)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_audit_timeline_list(uuid, int);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_audit_timeline_list(
  p_emissao_id uuid,
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  kind text,
  occurred_at timestamptz,
  message text,
  payload jsonb,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    a.kind,
    a.occurred_at,
    a.message,
    a.payload,
    a.source
  FROM public.fiscal_nfe_audit_timeline a
  WHERE a.empresa_id = v_empresa
    AND a.emissao_id = p_emissao_id
  ORDER BY a.occurred_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_audit_timeline_list(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_audit_timeline_list(uuid, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Upsert rascunho + itens (admin)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_draft_upsert(
  p_emissao_id uuid DEFAULT NULL,
  p_destinatario_pessoa_id uuid DEFAULT NULL,
  p_ambiente text DEFAULT 'homologacao',
  p_natureza_operacao text DEFAULT NULL,
  p_total_frete numeric DEFAULT 0,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_emissao_id uuid := p_emissao_id;
  v_ambiente text := COALESCE(NULLIF(btrim(p_ambiente), ''), 'homologacao');
  v_natureza text := NULLIF(btrim(COALESCE(p_natureza_operacao, '')), '');
  v_frete numeric := COALESCE(p_total_frete, 0);
  v_items_count int := 0;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  IF v_ambiente NOT IN ('homologacao', 'producao') THEN
    RAISE EXCEPTION 'Ambiente inválido.' USING errcode='22023';
  END IF;

  IF v_natureza IS NULL THEN
    RAISE EXCEPTION 'Natureza da operação é obrigatória.' USING errcode='22023';
  END IF;

  IF p_destinatario_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'Destinatário é obrigatório.' USING errcode='22023';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Itens inválidos.' USING errcode='22023';
  END IF;

  SELECT COUNT(*)::int INTO v_items_count FROM jsonb_array_elements(p_items);
  IF v_items_count <= 0 THEN
    RAISE EXCEPTION 'Adicione ao menos 1 item ao rascunho.' USING errcode='22023';
  END IF;

  IF v_emissao_id IS NOT NULL THEN
    UPDATE public.fiscal_nfe_emissoes e
       SET destinatario_pessoa_id = p_destinatario_pessoa_id,
           ambiente = v_ambiente,
           natureza_operacao = v_natureza,
           total_frete = v_frete,
           payload = COALESCE(p_payload, '{}'::jsonb),
           updated_at = now()
     WHERE e.id = v_emissao_id
       AND e.empresa_id = v_empresa;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rascunho não encontrado.' USING errcode='P0001';
    END IF;
  ELSE
    INSERT INTO public.fiscal_nfe_emissoes (
      empresa_id,
      provider_slug,
      ambiente,
      status,
      destinatario_pessoa_id,
      natureza_operacao,
      total_frete,
      payload
    )
    VALUES (
      v_empresa,
      'FOCUSNFE',
      v_ambiente,
      'rascunho',
      p_destinatario_pessoa_id,
      v_natureza,
      v_frete,
      COALESCE(p_payload, '{}'::jsonb)
    )
    RETURNING id INTO v_emissao_id;
  END IF;

  DELETE FROM public.fiscal_nfe_emissao_itens i
  WHERE i.empresa_id = v_empresa
    AND i.emissao_id = v_emissao_id;

  INSERT INTO public.fiscal_nfe_emissao_itens (
    empresa_id,
    emissao_id,
    produto_id,
    ordem,
    descricao,
    unidade,
    ncm,
    cfop,
    cst,
    csosn,
    quantidade,
    valor_unitario,
    valor_desconto,
    valor_total
  )
  SELECT
    v_empresa,
    v_emissao_id,
    NULLIF(btrim(COALESCE(it->>'produto_id', '')), '')::uuid,
    (row_number() OVER ())::int AS ordem,
    COALESCE(NULLIF(btrim(COALESCE(it->>'descricao', '')), ''), 'Item'),
    COALESCE(NULLIF(btrim(COALESCE(it->>'unidade', '')), ''), 'un'),
    NULLIF(btrim(COALESCE(it->>'ncm', '')), ''),
    NULLIF(btrim(COALESCE(it->>'cfop', '')), ''),
    NULLIF(btrim(COALESCE(it->>'cst', '')), ''),
    NULLIF(btrim(COALESCE(it->>'csosn', '')), ''),
    COALESCE(NULLIF(it->>'quantidade', '')::numeric, 0),
    COALESCE(NULLIF(it->>'valor_unitario', '')::numeric, 0),
    COALESCE(NULLIF(it->>'valor_desconto', '')::numeric, 0),
    GREATEST(
      0,
      (COALESCE(NULLIF(it->>'quantidade', '')::numeric, 0) * COALESCE(NULLIF(it->>'valor_unitario', '')::numeric, 0))
      - COALESCE(NULLIF(it->>'valor_desconto', '')::numeric, 0)
    )
  FROM jsonb_array_elements(p_items) it;

  PERFORM public.fiscal_nfe_recalc_totais(v_emissao_id);

  RETURN v_emissao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_draft_upsert(uuid, uuid, text, text, numeric, jsonb, jsonb) TO authenticated, service_role;

COMMIT;
