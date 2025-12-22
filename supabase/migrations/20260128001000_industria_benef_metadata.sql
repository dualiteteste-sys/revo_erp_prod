-- ============================================================================
-- Beneficiamento: campos adicionais (caixas, NF, pedido) em OP/OB
-- - Adiciona colunas na tabela public.industria_ordens
-- - Atualiza RPCs: industria_upsert_ordem (__unsafe + wrapper), industria_list_ordens,
--   industria_clone_ordem (__unsafe + wrapper)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Novas colunas na tabela de ordens
-- ----------------------------------------------------------------------------
ALTER TABLE public.industria_ordens
  ADD COLUMN IF NOT EXISTS qtde_caixas numeric(15,4),
  ADD COLUMN IF NOT EXISTS numero_nf text,
  ADD COLUMN IF NOT EXISTS pedido_numero text;

-- ----------------------------------------------------------------------------
-- 2) industria_upsert_ordem (__unsafe + wrapper com RBAC)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_upsert_ordem(jsonb);
DROP FUNCTION IF EXISTS public.industria_upsert_ordem__unsafe(jsonb);

CREATE OR REPLACE FUNCTION public.industria_upsert_ordem__unsafe(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
  v_status_atual text;
  v_execucao_id uuid;
  v_old_produto uuid;
  v_old_qtd numeric;
  v_old_unidade text;
  v_old_cliente uuid;
  v_old_tipo text;
  v_old_roteiro uuid;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT status, execucao_ordem_id, produto_final_id, quantidade_planejada, unidade, cliente_id, tipo_ordem, roteiro_aplicado_id
      INTO v_status_atual, v_execucao_id, v_old_produto, v_old_qtd, v_old_unidade, v_old_cliente, v_old_tipo, v_old_roteiro
      FROM public.industria_ordens
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id;

    IF v_status_atual IS NULL THEN
      RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
    END IF;

    IF v_status_atual IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Ordem % está % e não pode ser alterada.', (p_payload->>'id')::uuid, v_status_atual;
    END IF;

    IF v_execucao_id IS NOT NULL THEN
      IF (p_payload ? 'produto_final_id') AND (p_payload->>'produto_final_id')::uuid IS DISTINCT FROM v_old_produto THEN
        RAISE EXCEPTION 'Não é permitido alterar o produto após gerar a Execução.';
      END IF;
      IF (p_payload ? 'quantidade_planejada') AND (p_payload->>'quantidade_planejada')::numeric IS DISTINCT FROM v_old_qtd THEN
        RAISE EXCEPTION 'Não é permitido alterar a quantidade após gerar a Execução.';
      END IF;
      IF (p_payload ? 'unidade') AND (p_payload->>'unidade') IS DISTINCT FROM v_old_unidade THEN
        RAISE EXCEPTION 'Não é permitido alterar a unidade após gerar a Execução.';
      END IF;
      IF (p_payload ? 'cliente_id') AND (p_payload->>'cliente_id')::uuid IS DISTINCT FROM v_old_cliente THEN
        RAISE EXCEPTION 'Não é permitido alterar o cliente após gerar a Execução.';
      END IF;
      IF (p_payload ? 'tipo_ordem') AND (p_payload->>'tipo_ordem') IS DISTINCT FROM v_old_tipo THEN
        RAISE EXCEPTION 'Não é permitido alterar o tipo após gerar a Execução.';
      END IF;
      IF (p_payload ? 'roteiro_aplicado_id') AND (p_payload->>'roteiro_aplicado_id')::uuid IS DISTINCT FROM v_old_roteiro THEN
        RAISE EXCEPTION 'Não é permitido alterar o roteiro após gerar a Execução.';
      END IF;
    END IF;

    UPDATE public.industria_ordens
       SET
         tipo_ordem            = COALESCE(p_payload->>'tipo_ordem', tipo_ordem),
         produto_final_id      = COALESCE((p_payload->>'produto_final_id')::uuid, produto_final_id),
         quantidade_planejada  = COALESCE((p_payload->>'quantidade_planejada')::numeric, quantidade_planejada),
         unidade               = COALESCE(p_payload->>'unidade', unidade),
         cliente_id            = COALESCE((p_payload->>'cliente_id')::uuid, cliente_id),
         status                = COALESCE(p_payload->>'status', status, 'rascunho'),
         prioridade            = COALESCE((p_payload->>'prioridade')::int, prioridade, 0),
         data_prevista_inicio  = COALESCE((p_payload->>'data_prevista_inicio')::date, data_prevista_inicio),
         data_prevista_fim     = COALESCE((p_payload->>'data_prevista_fim')::date, data_prevista_fim),
         data_prevista_entrega = COALESCE((p_payload->>'data_prevista_entrega')::date, data_prevista_entrega),
         documento_ref         = COALESCE(p_payload->>'documento_ref', documento_ref),
         observacoes           = COALESCE(p_payload->>'observacoes', observacoes),
         usa_material_cliente  = COALESCE((p_payload->>'usa_material_cliente')::boolean, usa_material_cliente, false),
         material_cliente_id   = COALESCE((p_payload->>'material_cliente_id')::uuid, material_cliente_id),
         roteiro_aplicado_id   = COALESCE((p_payload->>'roteiro_aplicado_id')::uuid, roteiro_aplicado_id),
         roteiro_aplicado_desc = COALESCE(p_payload->>'roteiro_aplicado_desc', roteiro_aplicado_desc),
         qtde_caixas           = COALESCE((p_payload->>'qtde_caixas')::numeric, qtde_caixas),
         numero_nf             = COALESCE(p_payload->>'numero_nf', numero_nf),
         pedido_numero         = COALESCE(p_payload->>'pedido_numero', pedido_numero)
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = v_empresa_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.industria_ordens (
      empresa_id,
      tipo_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      cliente_id,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes,
      usa_material_cliente,
      material_cliente_id,
      roteiro_aplicado_id,
      roteiro_aplicado_desc,
      qtde_caixas,
      numero_nf,
      pedido_numero
    ) VALUES (
      v_empresa_id,
      p_payload->>'tipo_ordem',
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      (p_payload->>'cliente_id')::uuid,
      COALESCE(p_payload->>'status', 'rascunho'),
      COALESCE((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      COALESCE((p_payload->>'usa_material_cliente')::boolean, false),
      (p_payload->>'material_cliente_id')::uuid,
      (p_payload->>'roteiro_aplicado_id')::uuid,
      p_payload->>'roteiro_aplicado_desc',
      (p_payload->>'qtde_caixas')::numeric,
      p_payload->>'numero_nf',
      p_payload->>'pedido_numero'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  RETURN public.industria_get_ordem_details(v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.industria_upsert_ordem(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');
  RETURN public.industria_upsert_ordem__unsafe(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_upsert_ordem__unsafe(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem__unsafe(jsonb) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.industria_upsert_ordem(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem(jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) industria_list_ordens com novos campos (caixas, NF, pedido, created_at)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_list_ordens(text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.industria_list_ordens(
  p_search text default null,
  p_tipo   text default null,
  p_status text default null,
  p_limit  int   default 50,
  p_offset int   default 0
)
RETURNS TABLE (
  id                   uuid,
  numero               int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric,
  qtde_caixas          numeric,
  numero_nf            text,
  pedido_numero        text,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.numero,
    o.tipo_ordem,
    p.nome AS produto_nome,
    c.nome AS cliente_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    COALESCE((
      SELECT SUM(e.quantidade_entregue)
      FROM public.industria_ordens_entregas e
      WHERE e.ordem_id = o.id
        AND e.empresa_id = v_empresa_id
    ), 0) AS total_entregue,
    o.qtde_caixas,
    o.numero_nf,
    o.pedido_numero,
    o.created_at
  FROM public.industria_ordens o
  JOIN public.produtos p
    ON o.produto_final_id = p.id
  LEFT JOIN public.pessoas c
    ON o.cliente_id = c.id
  WHERE o.empresa_id = v_empresa_id
    AND (
      p_search IS NULL
      OR o.numero::text ILIKE '%' || p_search || '%'
      OR p.nome          ILIKE '%' || p_search || '%'
      OR c.nome          ILIKE '%' || p_search || '%'
    )
    AND (p_tipo IS NULL   OR o.tipo_ordem = p_tipo)
    AND (p_status IS NULL OR o.status     = p_status)
  ORDER BY o.prioridade DESC, o.data_prevista_entrega ASC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_list_ordens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_list_ordens TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) industria_clone_ordem (__unsafe + wrapper) preservando novos campos
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.industria_clone_ordem(uuid);
DROP FUNCTION IF EXISTS public.industria_clone_ordem__unsafe(uuid);

CREATE OR REPLACE FUNCTION public.industria_clone_ordem__unsafe(p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_new_id uuid;
  v_src public.industria_ordens%ROWTYPE;
BEGIN
  SELECT *
    INTO v_src
    FROM public.industria_ordens
   WHERE id = p_source_id
     AND empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  INSERT INTO public.industria_ordens (
    empresa_id,
    tipo_ordem,
    produto_final_id,
    quantidade_planejada,
    unidade,
    cliente_id,
    status,
    prioridade,
    data_prevista_inicio,
    data_prevista_fim,
    data_prevista_entrega,
    documento_ref,
    observacoes,
    usa_material_cliente,
    material_cliente_id,
    qtde_caixas,
    numero_nf,
    pedido_numero
  ) VALUES (
    v_empresa_id,
    v_src.tipo_ordem,
    v_src.produto_final_id,
    v_src.quantidade_planejada,
    v_src.unidade,
    v_src.cliente_id,
    'rascunho',
    0,
    NULL,
    NULL,
    NULL,
    CASE
      WHEN v_src.documento_ref IS NULL OR btrim(v_src.documento_ref) = '' THEN
        CASE WHEN v_src.numero IS NOT NULL THEN 'Clone da ordem ' || v_src.numero::text ELSE 'Clone de ordem' END
      ELSE
        '[CLONE] ' || v_src.documento_ref
    END,
    v_src.observacoes,
    COALESCE(v_src.usa_material_cliente, false),
    v_src.material_cliente_id,
    v_src.qtde_caixas,
    v_src.numero_nf,
    v_src.pedido_numero
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.industria_ordens_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    unidade,
    origem
  )
  SELECT
    v_empresa_id,
    v_new_id,
    c.produto_id,
    c.quantidade_planejada,
    c.unidade,
    c.origem
  FROM public.industria_ordens_componentes c
  WHERE c.ordem_id = p_source_id
    AND c.empresa_id = v_empresa_id;

  RETURN public.industria_get_ordem_details(v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.industria_clone_ordem(p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');
  RETURN public.industria_clone_ordem__unsafe(p_source_id);
END;
$$;

REVOKE ALL ON FUNCTION public.industria_clone_ordem__unsafe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_clone_ordem__unsafe(uuid) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.industria_clone_ordem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.industria_clone_ordem(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) Reload cache do PostgREST
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
