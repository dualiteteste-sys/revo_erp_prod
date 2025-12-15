-- Pós-deploy: garante que o PostgREST recarregue o schema e que o login do Operador
-- funcione sem sessão Supabase (role anon), mantendo o restante do módulo protegido.

-- Permite autenticação de operador a partir do modo Operador (sem sessão Supabase).
DO $$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operador_autenticar(text, text) TO anon';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Função public.industria_operador_autenticar(text,text) não existe (ainda).';
END $$;

-- Força o PostgREST a recarregar schema/config após alterações de RPCs/colunas.
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
  PERFORM pg_notify('pgrst', 'reload config');
END $$;

