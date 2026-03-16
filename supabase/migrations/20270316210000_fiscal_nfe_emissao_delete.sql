/*
  RPC para excluir NF-e emissão (rascunho, erro ou rejeitada).
  Apenas admin pode excluir.
  Tabelas filhas usam ON DELETE CASCADE / SET NULL.
*/

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_status  text;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  SELECT status INTO v_status
  FROM public.fiscal_nfe_emissoes
  WHERE id = p_id AND empresa_id = v_empresa;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'NF-e não encontrada ou sem permissão.' USING errcode = 'P0002';
  END IF;

  IF v_status NOT IN ('rascunho', 'erro', 'rejeitada') THEN
    RAISE EXCEPTION 'Só é possível excluir NF-e com status rascunho, erro ou rejeitada. Status atual: %', v_status
      USING errcode = 'P0002';
  END IF;

  DELETE FROM public.fiscal_nfe_emissoes
  WHERE id = p_id AND empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_delete(uuid) TO authenticated, service_role;

-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
