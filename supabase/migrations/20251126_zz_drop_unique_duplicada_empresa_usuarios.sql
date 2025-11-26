-- Remoção de UNIQUE redundante em public.empresa_usuarios
-- Mantemos a PK (empresa_usuarios_pkey).
-- Não usa TRANSACTION para permitir bloqueios mínimos.

-- [RPC] Drop UNIQUE constraint se existir
ALTER TABLE IF EXISTS public.empresa_usuarios
  DROP CONSTRAINT IF EXISTS empresa_usuarios_empresa_user_uniq;

-- Caso em alguns ambientes o nome acima tenha sido criado como índice “solto”
-- (não como constraint), faça o drop do índice redundante também:
-- OBS: DROP INDEX CONCURRENTLY não pode estar dentro de transaction.
DROP INDEX CONCURRENTLY IF EXISTS public.empresa_usuarios_empresa_user_uniq;
