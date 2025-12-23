-- =============================================================================
-- Hotfix: corrigir funções industria_roteiros_list e industria_bom_list (assinatura única, sem DO/EXECUTE)
-- - Remove overloads antigos
-- - Recria funções com suporte a tipo_bom = 'ambos'
-- - Ajusta tipos de data em BOM (date)
-- =============================================================================
BEGIN;

-- ROTEIROS --------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.industria_roteiros_list FROM public;
GRANT EXECUTE ON FUNCTION public.industria_roteiros_list TO authenticated, service_role;

-- BOMS ------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.industria_bom_list FROM public;
GRANT EXECUTE ON FUNCTION public.industria_bom_list TO authenticated, service_role;

COMMIT;
