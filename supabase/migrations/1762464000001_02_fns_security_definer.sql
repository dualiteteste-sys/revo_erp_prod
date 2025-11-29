-- =============================================================================
-- Migration: Alinhar Funções Críticas com SECURITY DEFINER
-- Descrição: Define funções de contexto com SECURITY DEFINER e search_path fixo.
-- Impacto:
--   - Segurança: Médio. Padroniza a execução das funções de contexto.
--   - Reversibilidade: Sim, revertendo para SECURITY INVOKER ou removendo funções.
-- =============================================================================

set local search_path = pg_catalog, public;

-- current_user_id()
create or replace function public.current_user_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub text;
begin
  -- Supabase 2.x: claim direto
  begin
    v_sub := current_setting('request.jwt.claim.sub', true);
  exception when others then
    v_sub := null;
  end;

  -- Fallback: payload completo em request.jwt.claims
  if v_sub is null then
    begin
      v_sub := (current_setting('request.jwt.claims', true)::json ->> 'sub');
    exception when others then
      v_sub := null;
    end;
  end if;

  if v_sub is null then
    return null;
  end if;

  return v_sub::uuid;
end
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to authenticated, service_role;

-- current_empresa_id()
create or replace function public.current_empresa_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  -- Busca empresa principal do usuário logado
  select eu.empresa_id
  into v_empresa_id
  from public.empresa_usuarios eu
  where eu.user_id = public.current_user_id()
    and eu.is_principal is true
  order by eu.created_at
  limit 1;

  return v_empresa_id;
end
$$;

revoke all on function public.current_empresa_id() from public;
grant execute on function public.current_empresa_id() to authenticated, service_role;
