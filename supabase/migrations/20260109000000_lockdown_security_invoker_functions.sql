/*
  # [SECURITY][RPC] Lockdown EXECUTE em funções SECURITY INVOKER expostas

  ## Query Description:
  Esta migração remove permissões de execução (REVOKE EXECUTE) para os roles PUBLIC e anon
  em todas as funções SECURITY INVOKER do schema public que sejam consideradas "perigosas"
  (voláteis, contendo DML/EXEC ou usadas como triggers).
  Garante que apenas usuários autenticados (authenticated) e o sistema (service_role) possam executá-las.

  ## Metadata:
  - Schema-Category: "Security"
  - Impact-Level: "High" (Restringe acesso a funções)
  - Requires-Backup: false
  - Reversible: true (basta re-conceder permissões se necessário)

  ## Structure Details:
  - Varre pg_proc filtrando funções SECURITY INVOKER em public.
  - Analisa volatilidade e definição para detectar DML/EXEC.
  - Aplica REVOKE FROM PUBLIC, anon e GRANT TO authenticated, service_role.

  ## Security Implications:
  - RLS Status: N/A (Funções)
  - Policy Changes: No
  - Auth Requirements: Authenticated users only for affected functions.
*/

set local search_path = pg_catalog, public;

do $$
declare
  r record;
begin
  /*
    Seleciona funções invoker no schema public que hoje estão executáveis por PUBLIC/anon
    e que são voláteis OU têm DML/EXEC no corpo OU são usadas como trigger.
  */
  for r in
    with invoker_exposed as (
      select
        p.oid,
        (p.oid)::regprocedure::text as regproc,
        case p.provolatile when 'i' then 'IMMUTABLE'
                           when 's' then 'STABLE'
                           else 'VOLATILE' end as volatility,
        lower(pg_get_functiondef(p.oid)) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef = false -- Apenas SECURITY INVOKER
        and (
          has_function_privilege('anon',   p.oid, 'EXECUTE')
          or
          has_function_privilege('public', p.oid, 'EXECUTE')
        )
    ),
    flags as (
      select
        i.*,
        -- Regex simples para detectar DML ou EXECUTE dinâmico no corpo da função
        (i.def ~ '\b(insert|update|delete|truncate|copy|execute\s+)') as has_dml_or_exec,
        -- Verifica se é usada como trigger
        exists (select 1 from pg_trigger t where t.tgfoid = i.oid)   as is_trigger
      from invoker_exposed i
    )
    select regproc
    from flags
    where volatility = 'VOLATILE'
       or has_dml_or_exec
       or is_trigger
  loop
    -- Remove permissão de execução pública/anônima
    execute format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.regproc);
    
    -- Garante permissão para autenticados e serviço
    execute format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.regproc);
  end loop;
end
$$ language plpgsql;
