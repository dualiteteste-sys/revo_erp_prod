-- =============================================================================
-- Fix: industria_bom_* usa date (não timestamptz) para vigência
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.industria_bom_list(text, uuid, text, boolean, int, int);
DROP FUNCTION IF EXISTS public.industria_bom_upsert(jsonb);

DO $$
BEGIN
  IF to_regclass('public.industria_boms') IS NOT NULL THEN
    EXECUTE $sql$
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
  data_inicio_vigencia date,
  data_fim_vigencia date
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
    AND (p_ativo IS NULL OR b.ativo = p_ativo)
  ORDER BY
    p.nome ASC,
    b.tipo_bom,
    b.versao DESC,
    b.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.industria_boms') IS NOT NULL THEN
    EXECUTE $sql$
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
         data_inicio_vigencia       = coalesce((p_payload->>'data_inicio_vigencia')::date, data_inicio_vigencia),
         data_fim_vigencia          = coalesce((p_payload->>'data_fim_vigencia')::date, data_fim_vigencia),
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
      (p_payload->>'data_inicio_vigencia')::date,
      (p_payload->>'data_fim_vigencia')::date,
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
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.industria_bom_list(text, uuid, text, boolean, int, int)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_list(text, uuid, text, boolean, int, int) FROM public';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_list(text, uuid, text, boolean, int, int) TO authenticated, service_role';
  END IF;
  IF to_regprocedure('public.industria_bom_upsert(jsonb)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_upsert(jsonb) TO authenticated, service_role';
  END IF;
END $$;

COMMIT;
