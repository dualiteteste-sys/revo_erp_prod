-- Permitir exclusão de pedidos de venda em status 'orcamento' (rascunho).
-- Pedidos aprovados/concluídos/cancelados NÃO podem ser excluídos.
-- Itens, expedições e devoluções cascadeiam via FK ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.vendas_delete_pedido(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_status  text;
  v_has_nfe boolean;
  v_count   int;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'update');

  SELECT status INTO v_status
  FROM public.vendas_pedidos
  WHERE id = p_id AND empresa_id = v_empresa;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado ou acesso negado.';
  END IF;

  IF v_status <> 'orcamento' THEN
    RAISE EXCEPTION 'Só é possível excluir pedidos em orçamento. Status atual: %.', v_status;
  END IF;

  -- Safety: rejeitar se NF-e vinculada (não deveria existir em orcamento, mas por segurança)
  SELECT EXISTS(
    SELECT 1 FROM public.fiscal_nfe_emissoes
    WHERE pedido_origem_id = p_id
  ) INTO v_has_nfe;

  IF v_has_nfe THEN
    RAISE EXCEPTION 'Não é possível excluir: há NF-e vinculada a este pedido.';
  END IF;

  DELETE FROM public.vendas_pedidos
  WHERE id = p_id AND empresa_id = v_empresa;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_delete_pedido(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendas_delete_pedido(uuid) TO authenticated, service_role;
