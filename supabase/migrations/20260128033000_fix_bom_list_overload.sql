-- =============================================================================
-- Fix: remover overloads e padronizar industria_bom_list com 6 params
-- (inclui suporte a tipo_bom = 'ambos')
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.industria_bom_list(text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.industria_bom_list(text, uuid, text, boolean, int, int);

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
    AND (p_ativo IS NULL OR b.ativo = p_ativo)
  ORDER BY
    p.nome ASC,
    b.tipo_bom,
    b.versao DESC,
    b.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_bom_list FROM public;
GRANT EXECUTE ON FUNCTION public.industria_bom_list TO authenticated, service_role;

COMMIT;
