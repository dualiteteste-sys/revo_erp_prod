-- ============================================================================
-- Fix: Tenant Leakage via Header-Based Context (Request Isolation)
-- ============================================================================

BEGIN;

-- 1) Atualiza current_empresa_id para priorizar Header HTTP (x-empresa-id)
--    Isso permite que cada requisição (aba/janela) declare explicitamente qual
--    empresa quer acessar, sem depender do estado global 'user_active_empresa'.

create or replace function public.current_empresa_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_header_emp uuid;
  v_uid uuid := public.current_user_id();
  v_headers json;
  v_guc_emp uuid;
begin
  if v_uid is null then
    return null;
  end if;

  -- A) Tenta ler do Header HTTP (injetado pelo cliente Supabase)
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null and (v_headers ->> 'x-empresa-id') is not null then
    begin
      -- Try cast to UUID
      v_header_emp := (v_headers ->> 'x-empresa-id')::uuid;
      
      -- SEGURANÇA: Valida se o usuário REALMENTE pertence a essa empresa.
      if public.is_user_member_of(v_header_emp) then
        return v_header_emp;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- B) Configuração de Sessão (GUC) - usado por jobs/testes
  begin
     v_guc_emp := nullif(current_setting('app.current_empresa_id', true), '')::uuid;
  exception when others then
     v_guc_emp := null;
  end;
  
  if v_guc_emp is not null then
    return v_guc_emp;
  end if;

  -- C) Fallback Legado: Estado persistido no banco (user_active_empresa)
  return public.get_preferred_empresa_for_user(v_uid);
end;
$$;

revoke all on function public.current_empresa_id() from public, anon;
grant execute on function public.current_empresa_id() to authenticated, service_role, postgres;

select pg_notify('pgrst', 'reload schema');

COMMIT;
