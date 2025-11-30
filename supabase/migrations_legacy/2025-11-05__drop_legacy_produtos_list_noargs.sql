-- =====================================================================
-- Migração: Drop legacy produtos_list_for_current_user() sem argumentos
-- Data: 2025-11-05
-- Impacto (Resumo)
-- - Segurança: remove RPC invoker sem filtros explícitos (conforme Regra 2/9).
-- - Compatibilidade: front usa a variante parametrizada criada no passo 2.
-- - Reversibilidade: seria possível recriar, porém não recomendado.
-- - Performance: n/a.
-- =====================================================================

-- Remove a variante sem argumentos (se existir).
drop function if exists public.produtos_list_for_current_user();

-- Opcional: reforçar grants da variante parametrizada (já aplicada no passo 2).
revoke all on function public.produtos_list_for_current_user(integer, integer, text, status_produto, text) from public;
grant execute on function public.produtos_list_for_current_user(integer, integer, text, status_produto, text) to authenticated, service_role;

select pg_notify('app_log', '[RPC] dropped legacy produtos_list_for_current_user() (no-args)');
