-- FIX: Restaurar fiscal_nfe_emissoes_list(text, text, int)
-- O migration 20260306120000_fiscal_nfe_estado_da_arte.sql fez DROP desta função antes de recriar
-- a versão 5-param (com filtros de data). Como o migration 20270118113000 que criou a versão 3-param
-- já está marcado como aplicado em PROD, ele não re-roda. Este migration restaura a versão 3-param
-- para que o schema diff (expected vs PROD) volte a estar alinhado.

BEGIN;

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

COMMIT;
