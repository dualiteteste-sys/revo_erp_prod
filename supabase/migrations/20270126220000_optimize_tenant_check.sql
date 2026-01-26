-- ============================================================================
-- Performance Fix: Optimize Tenant Checks (Index-Only Scan + No Context Switch)
-- ============================================================================

BEGIN;

-- 1) Permitir que usuários "enxerguem" seus próprios vínculos sem depender da empresa ativa.
--    Isso quebra a recursão do RLS e permite remover o SECURITY DEFINER (lento).
create policy "policy_select_own_memberships"
  on public.empresa_usuarios
  for select
  to authenticated
  using ( user_id = public.current_user_id() );

-- 2) Otimizar is_user_member_of
--    - Remover SECURITY DEFINER (evita context switch para owner a cada linha).
--    - Manter STABLE (cache intra-query).
--    - Com a policy acima, o SELECT interno funciona como INVOKER (muito mais rápido).
create or replace function public.is_user_member_of(p_empresa_id uuid)
returns boolean
language sql
stable
-- security definer REMOVIDO!
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.empresa_usuarios eu
    where eu.user_id = public.current_user_id() -- usa função wrapper segura
      and eu.empresa_id = p_empresa_id
  );
$$;

-- 3) Garantir que current_empresa_id permaneça STABLE (reverte mudanças de debug, se houver)
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

  -- A) Tenta ler do Header HTTP (FAST PATH)
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null and (v_headers ->> 'x-empresa-id') is not null then
    begin
      v_header_emp := (v_headers ->> 'x-empresa-id')::uuid;
      
      -- SEGURANÇA: Valida se o usuário pertence a essa empresa.
      -- Agora ultra-rápido graças ao Index-Only Scan sem overhead de role switch.
      if public.is_user_member_of(v_header_emp) then
        return v_header_emp;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- B) Configuração de Sessão (GUC)
  begin
     v_guc_emp := nullif(current_setting('app.current_empresa_id', true), '')::uuid;
  exception when others then
     v_guc_emp := null;
  end;
  
  if v_guc_emp is not null then
    return v_guc_emp;
  end if;

  -- C) Fallback Legado
  return public.get_preferred_empresa_for_user(v_uid);
end;
$$;

select pg_notify('pgrst', 'reload schema');

COMMIT;
