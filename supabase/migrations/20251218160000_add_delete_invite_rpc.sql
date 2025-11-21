/*
# [Feature] RPC para Excluir Convite Pendente
- Adiciona a função `delete_pending_invitation(p_user_id uuid)`
- Requer permissão 'usuarios.manage'
- Remove o vínculo da tabela `empresa_usuarios` apenas se o status for 'PENDING'
- Padrões: SECURITY DEFINER, SET search_path, idempotente.
*/

-- 1) RPC: Excluir um convite pendente (remove o vínculo da empresa)
CREATE OR REPLACE FUNCTION public.delete_pending_invitation(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Checagem de permissão
  IF NOT public.has_permission_for_current_user('usuarios', 'manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Você não tem permissão para gerenciar usuários.';
  END IF;

  -- Deleta o vínculo apenas se o usuário estiver pendente na empresa atual
  DELETE FROM public.empresa_usuarios
  WHERE empresa_id = public.current_empresa_id()
    AND user_id = p_user_id
    AND status = 'PENDING';

  -- Se nenhuma linha foi deletada, pode ser que o usuário não exista ou já esteja ativo.
  -- A operação é silenciosa nesse caso para ser idempotente.
END;
$$;

REVOKE ALL ON FUNCTION public.delete_pending_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pending_invitation(uuid) TO authenticated, service_role;

-- 2) Recarregar schema do PostgREST
SELECT pg_notify('pgrst', 'reload schema');
