/*
  Fix: PostgREST HTTP_300 (PGRST203) em compras_list_pedidos

  Existiam 2 overloads:
  - compras_list_pedidos(p_search, p_status)
  - compras_list_pedidos(p_search, p_status, p_limit default, p_offset default)

  Com parâmetros default, PostgREST não consegue escolher o "melhor candidato".
  Solução: manter somente a versão com paginação (defaults) e remover a curta.
*/

BEGIN;

drop function if exists public.compras_list_pedidos(text, text);

revoke all on function public.compras_list_pedidos(text, text, integer, integer) from public, anon;
grant execute on function public.compras_list_pedidos(text, text, integer, integer) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

COMMIT;

