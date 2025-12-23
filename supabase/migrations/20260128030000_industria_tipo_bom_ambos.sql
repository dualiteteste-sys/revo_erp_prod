-- =============================================================================
-- Indústria: permitir "ambos" em roteiros e BOMs
-- - Ajusta colunas tipo_bom
-- - Recria funções de listagem/upsert com suporte a 'ambos'
-- =============================================================================
BEGIN;

-- 1) Ajustar colunas tipo_bom (roteiros e BOMs) para aceitar 'ambos'
ALTER TABLE IF EXISTS public.industria_roteiros
  ADD COLUMN IF NOT EXISTS tipo_bom text;

ALTER TABLE IF EXISTS public.industria_roteiros
  ALTER COLUMN tipo_bom TYPE text,
  ALTER COLUMN tipo_bom DROP DEFAULT;

ALTER TABLE IF EXISTS public.industria_boms
  ADD COLUMN IF NOT EXISTS tipo_bom text;

ALTER TABLE IF EXISTS public.industria_boms
  ALTER COLUMN tipo_bom TYPE text,
  ALTER COLUMN tipo_bom DROP DEFAULT;

-- 2) ROTEIROS: função de listagem (assinatura única, com paginação)
DROP FUNCTION IF EXISTS public.industria_roteiros_list(text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.industria_roteiros_list(text, uuid, text, boolean, int, int);

CREATE OR REPLACE FUNCTION public.industria_roteiros_list(
  p_search     text    default null,
  p_produto_id uuid    default null,
  p_tipo_bom   text    default null, -- 'producao' | 'beneficiamento' | 'ambos'
  p_ativo      boolean default null,
  p_limit      int     default 50,
  p_offset     int     default 0
)
RETURNS TABLE (
  id                         uuid,
  produto_id                 uuid,
  produto_nome               text,
  tipo_bom                   text,
  codigo                     text,
  descricao                  text,
  versao                     text,
  ativo                      boolean,
  padrao_para_producao       boolean,
  padrao_para_beneficiamento boolean
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
    r.id,
    r.produto_id,
    p.nome as produto_nome,
    r.tipo_bom,
    r.codigo,
    r.descricao,
    r.versao::text as versao,
    r.ativo,
    r.padrao_para_producao,
    r.padrao_para_beneficiamento
  FROM public.industria_roteiros r
  JOIN public.produtos p ON r.produto_id = p.id
  WHERE r.empresa_id = v_empresa_id
    AND (p_produto_id IS NULL OR r.produto_id = p_produto_id)
    AND (
      p_tipo_bom IS NULL
      OR r.tipo_bom = p_tipo_bom
      OR r.tipo_bom = 'ambos'
      OR p_tipo_bom = 'ambos'
    )
    AND (p_ativo IS NULL OR r.ativo = p_ativo)
    AND (
      p_search IS NULL
      OR r.codigo    ILIKE '%' || p_search || '%'
      OR r.descricao ILIKE '%' || p_search || '%'
      OR p.nome      ILIKE '%' || p_search || '%'
    )
  ORDER BY
    p.nome ASC,
    r.tipo_bom,
    r.versao DESC,
    r.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 3) ROTEIROS: função de upsert (tipo_bom aceita 'ambos')
DROP FUNCTION IF EXISTS public.industria_roteiros_upsert(jsonb);

CREATE OR REPLACE FUNCTION public.industria_roteiros_upsert(p_payload jsonb)
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
         tipo_ordem            = CASE WHEN v_execucao_id IS NOT NULL THEN tipo_ordem ELSE p_payload->>'tipo_ordem' END,
         produto_final_id      = CASE WHEN v_execucao_id IS NOT NULL THEN produto_final_id ELSE COALESCE((p_payload->>'produto_final_id')::uuid, produto_final_id) END,
         quantidade_planejada  = CASE WHEN v_execucao_id IS NOT NULL THEN quantidade_planejada ELSE COALESCE((p_payload->>'quantidade_planejada')::numeric, quantidade_planejada) END,
         unidade               = CASE WHEN v_execucao_id IS NOT NULL THEN unidade ELSE COALESCE(p_payload->>'unidade', unidade) END,
         cliente_id            = CASE WHEN v_execucao_id IS NOT NULL THEN cliente_id ELSE (p_payload->>'cliente_id')::uuid END,
         status                = COALESCE(p_payload->>'status', status, 'rascunho'),
         prioridade            = COALESCE((p_payload->>'prioridade')::int, prioridade, 0),
         data_prevista_inicio  = COALESCE((p_payload->>'data_prevista_inicio')::date, data_prevista_inicio),
         data_prevista_fim     = COALESCE((p_payload->>'data_prevista_fim')::date, data_prevista_fim),
         data_prevista_entrega = COALESCE((p_payload->>'data_prevista_entrega')::date, data_prevista_entrega),
         documento_ref         = COALESCE(p_payload->>'documento_ref', documento_ref),
         observacoes           = COALESCE(p_payload->>'observacoes', observacoes),
         usa_material_cliente  = COALESCE((p_payload->>'usa_material_cliente')::boolean, usa_material_cliente, false),
         material_cliente_id   = COALESCE((p_payload->>'material_cliente_id')::uuid, material_cliente_id),
         roteiro_aplicado_id   = CASE WHEN v_execucao_id IS NOT NULL THEN roteiro_aplicado_id ELSE COALESCE((p_payload->>'roteiro_aplicado_id')::uuid, roteiro_aplicado_id) END,
         roteiro_aplicado_desc = CASE WHEN v_execucao_id IS NOT NULL THEN roteiro_aplicado_desc ELSE COALESCE(p_payload->>'roteiro_aplicado_desc', roteiro_aplicado_desc) END
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
      roteiro_aplicado_desc
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
      p_payload->>'roteiro_aplicado_desc'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  RETURN public.industria_get_ordem_details(v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_roteiros_list TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industria_roteiros_upsert TO authenticated, service_role;

-- 4) BOMs: função de listagem (mantém vigência como timestamptz aqui; corrigida mais adiante se necessário)
DROP FUNCTION IF EXISTS public.industria_bom_list(text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.industria_bom_list(text, uuid, text, boolean, int, int);
DROP FUNCTION IF EXISTS public.industria_bom_upsert(jsonb);

CREATE OR REPLACE FUNCTION public.industria_bom_list(
  p_search text default null,
  p_produto_id uuid default null,
  p_tipo_bom text default null, -- 'producao' | 'beneficiamento' | 'ambos'
  p_ativo boolean default null,
  p_limit int default 50,
  p_offset int default 0
)
RETURNS TABLE (
  id uuid,
  produto_final_id uuid,
  produto_nome text,
  tipo_bom text,
  codigo text,
  versao int,
  ativo boolean,
  padrao_para_producao boolean,
  padrao_para_beneficiamento boolean,
  data_inicio_vigencia timestamptz,
  data_fim_vigencia timestamptz
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
    b.id,
    b.produto_final_id,
    p.nome AS produto_nome,
    b.tipo_bom,
    b.codigo,
    b.versao,
    b.ativo,
    b.padrao_para_producao,
    b.padrao_para_beneficiamento,
    b.data_inicio_vigencia,
    b.data_fim_vigencia
  FROM public.industria_boms b
  JOIN public.produtos p ON p.id = b.produto_final_id
  WHERE b.empresa_id = v_empresa_id
    AND (p_search IS NULL OR b.codigo ILIKE '%' || p_search || '%' OR b.descricao ILIKE '%' || p_search || '%')
    AND (p_produto_id IS NULL OR b.produto_final_id = p_produto_id)
    AND (
      p_tipo_bom IS NULL
      OR b.tipo_bom = p_tipo_bom
      OR b.tipo_bom = 'ambos'
      OR p_tipo_bom = 'ambos'
    )
    AND (p_ativo IS NULL OR b.ativo = p_ativo);
END;
$$;

-- 5) BOMs: função de upsert com 'ambos'
CREATE OR REPLACE FUNCTION public.industria_bom_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id                         uuid;
  v_tipo_bom                   text;
  v_padrao_para_producao       boolean;
  v_padrao_para_beneficiamento boolean;
  v_result                     jsonb;
BEGIN
  v_tipo_bom := p_payload->>'tipo_bom';

  IF v_tipo_bom IS NULL OR v_tipo_bom NOT IN ('producao', 'beneficiamento', 'ambos') THEN
    RAISE EXCEPTION 'tipo_bom inválido. Use ''producao'', ''beneficiamento'' ou ''ambos''.';
  END IF;

  IF p_payload->>'produto_final_id' IS NULL THEN
    RAISE EXCEPTION 'produto_final_id é obrigatório.';
  END IF;

  v_padrao_para_producao :=
    coalesce((p_payload->>'padrao_para_producao')::boolean, false);
  v_padrao_para_beneficiamento :=
    coalesce((p_payload->>'padrao_para_beneficiamento')::boolean, false);

  -- Normaliza flags conforme tipo
  IF v_tipo_bom = 'producao' THEN
    v_padrao_para_beneficiamento := false;
  ELSIF v_tipo_bom = 'beneficiamento' THEN
    v_padrao_para_producao := false;
  END IF;

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.industria_boms
       SET
         produto_final_id           = (p_payload->>'produto_final_id')::uuid,
         tipo_bom                   = v_tipo_bom,
         codigo                     = p_payload->>'codigo',
         descricao                  = p_payload->>'descricao',
         versao                     = coalesce((p_payload->>'versao')::int, versao),
         ativo                      = coalesce((p_payload->>'ativo')::boolean, ativo),
         padrao_para_producao       = v_padrao_para_producao,
         padrao_para_beneficiamento = v_padrao_para_beneficiamento,
         data_inicio_vigencia       = coalesce((p_payload->>'data_inicio_vigencia')::timestamptz, data_inicio_vigencia),
         data_fim_vigencia          = coalesce((p_payload->>'data_fim_vigencia')::timestamptz, data_fim_vigencia),
         observacoes                = coalesce(p_payload->>'observacoes', observacoes)
     WHERE id = (p_payload->>'id')::uuid
       AND empresa_id = public.current_empresa_id()
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.industria_boms (
      empresa_id, produto_final_id, tipo_bom, codigo, descricao, versao,
      ativo, padrao_para_producao, padrao_para_beneficiamento,
      data_inicio_vigencia, data_fim_vigencia, observacoes
    ) VALUES (
      public.current_empresa_id(),
      (p_payload->>'produto_final_id')::uuid,
      v_tipo_bom,
      p_payload->>'codigo',
      p_payload->>'descricao',
      coalesce((p_payload->>'versao')::int, 1),
      coalesce((p_payload->>'ativo')::boolean, true),
      v_padrao_para_producao,
      v_padrao_para_beneficiamento,
      (p_payload->>'data_inicio_vigencia')::timestamptz,
      (p_payload->>'data_fim_vigencia')::timestamptz,
      p_payload->>'observacoes'
    ) RETURNING id INTO v_id;
  END IF;

  SELECT to_jsonb(b.*) || jsonb_build_object('produto_nome', p.nome)
    INTO v_result
    FROM public.industria_boms b
    JOIN public.produtos p ON p.id = b.produto_final_id
    WHERE b.id = v_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.industria_bom_list TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.industria_bom_upsert TO authenticated, service_role;

COMMIT;
