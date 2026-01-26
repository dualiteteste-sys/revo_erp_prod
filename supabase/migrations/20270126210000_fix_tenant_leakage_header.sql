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
      v_header_emp := (v_headers ->> 'x-empresa-id')::uuid;
      
      -- SEGURANÇA: Valida se o usuário REALMENTE pertence a essa empresa.
      -- Impede que um atacante force um ID de empresa alheia no header.
      if public.is_user_member_of(v_header_emp) then
        return v_header_emp;
      end if;
      -- Se não for membro, ignora o header e cai no fallback (ou poderia retornar null).
      -- Optamos por cair no fallback para manter compatibilidade em casos de borda.
    exception when others then
      -- ID inválido no header (não UUID), ignora.
      null;
    end;
  end if;

  -- B) Configuração de Sessão (GUC) - usado por jobs/testes
  begin
     return nullif(current_setting('app.current_empresa_id', true), '')::uuid;
  exception when others then
     null;
  end;

  -- C) Fallback Legado: Estado persistido no banco (user_active_empresa)
  -- Mantém compatibilidade se o frontend não mandar o header (Rollback Safe).
  return public.get_preferred_empresa_for_user(v_uid);
end;
$$;

revoke all on function public.current_empresa_id() from public, anon;
grant execute on function public.current_empresa_id() to authenticated, service_role, postgres;

-- Notifica PostgREST para recarregar schema (necessário para cache de funções STABLE)
select pg_notify('pgrst', 'reload schema');

COMMIT;
