/*
# [Hardening] Permissões da RPC bootstrap_empresa_for_current_user

## O que faz:
- Remove EXECUTE da role genérica PUBLIC.
- Garante EXECUTE apenas para authenticated e service_role.
- Recarrega o schema do PostgREST.

## Segurança:
- Reduz superfície: PUBLIC deixa de conseguir executar a RPC.
- authenticated/service_role continuam com acesso, usado pela aplicação.
- Não altera corpo da função, apenas ACL.

## Impacto:
- Baixo. Padrão alinhado com demais funções de negócio.
- Reversível via GRANT para outras roles, se necessário.
*/

begin;

-- 1) Remover EXECUTE de PUBLIC na função alvo (idempotente se PUBLIC já não tiver)
revoke all on function public.bootstrap_empresa_for_current_user(text, text)
  from public;

-- 2) Garantir EXECUTE para authenticated e service_role
grant execute on function public.bootstrap_empresa_for_current_user(text, text)
  to authenticated, service_role;

commit;

-- 3) Recarregar schema do PostgREST para refletir ACL atual
select pg_notify('pgrst','reload schema');
