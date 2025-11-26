/*
  # Lockdown EXECUTE on SECURITY DEFINER functions
  Revokes EXECUTE permission from PUBLIC and anon roles for all SECURITY DEFINER functions in the public schema.
  Grants EXECUTE permission only to authenticated and service_role.

  ## Query Description:
  This operation enhances security by ensuring that sensitive functions (SECURITY DEFINER) are not accessible to unauthenticated users or the public role by default. It iterates through existing functions and applies the permissions.

  ## Metadata:
  - Schema-Category: "Safe"
  - Impact-Level: "Medium"
  - Requires-Backup: false
  - Reversible: true (by granting back to PUBLIC/anon if needed)

  ## Structure Details:
  - Modifies function privileges in public schema.

  ## Security Implications:
  - RLS Status: N/A (Function privileges)
  - Policy Changes: No
  - Auth Requirements: Authenticated users only for these functions.

  ## Performance Impact:
  - Indexes: None
  - Triggers: None
  - Estimated Impact: Negligible.
*/

-- [SECURITY] Lockdown EXECUTE on SECURITY DEFINER functions (schema public)
-- Idempotente. Pode rodar em produção.
-- search_path fixado
set local search_path = pg_catalog, public;

do $$
declare
  r record;
begin
  /*
    Seleciona TODAS as funções SECURITY DEFINER no schema public
    e aplica REVOKE/GRANT por assinatura (regprocedure).
  */
  for r in
    select
      p.oid,
      p.prosecdef,
      (p.oid)::regprocedure::text as regproc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    -- REVOKE é idempotente; remove de PUBLIC e anon
    execute format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.regproc);

    -- Garante EXECUTE apenas para authenticated e service_role
    execute format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.regproc);
  end loop;
end
$$ language plpgsql;

-- Comentário de diagnóstico:
-- Para verificar se funcionou, você pode rodar manualmente no SQL Editor:
/*
select
  n.nspname as schema,
  p.proname as function,
  '(' || pg_get_function_identity_arguments(p.oid) || ')' as args,
  has_function_privilege('public', p.oid, 'EXECUTE')  as exec_public,
  has_function_privilege('anon',   p.oid, 'EXECUTE')  as exec_anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as exec_authenticated,
  has_function_privilege('service_role',  p.oid, 'EXECUTE') as exec_service_role
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and (has_function_privilege('public', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE'));
*/
