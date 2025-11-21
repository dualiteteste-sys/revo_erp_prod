-- =============================================================================
-- [Fix] Tornar public.current_empresa_id() resiliente com fallback
-- Objetivo: current_empresa_id() lê GUC se houver, SENÃO cai para preferência 
--           persistida (user_active_empresa) ou vínculo único.
-- Padrões: SECURITY DEFINER, search_path fixo, STABLE. Idempotente.
-- =============================================================================

-- 0) Helper opcional: get_preferred_empresa_for_user (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'get_preferred_empresa_for_user'
      and pg_function_is_visible(oid)
  ) then
    execute $fn$
      create or replace function public.get_preferred_empresa_for_user(p_user_id uuid)
      returns uuid
      language plpgsql
      stable
      security definer
      set search_path = pg_catalog, public
      as $$
      declare
        v_emp uuid;
      begin
        -- 1) preferência explícita persistida
        select uae.empresa_id into v_emp
          from public.user_active_empresa uae
         where uae.user_id = p_user_id;
        if v_emp is not null then
          return v_emp;
        end if;

        -- 2) fallback: único vínculo
        select eu.empresa_id into v_emp
          from public.empresa_usuarios eu
         where eu.user_id = p_user_id;

        if found and (select count(*) from public.empresa_usuarios where user_id = p_user_id) = 1 then
          return v_emp;
        end if;

        return null;
      end;
      $$;
    $fn$;
  end if;
end$$;

-- 1) current_empresa_id(): GUC -> preferência persistida -> único vínculo
create or replace function public.current_empresa_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid;
  v_uid uuid := public.current_user_id();
begin
  if v_uid is null then
    return null;
  end if;

  -- Tenta GUC do request (se o app setou)
  begin
    v_emp := nullif(current_setting('app.current_empresa_id', true), '')::uuid;
  exception when others then
    v_emp := null;
  end;

  if v_emp is not null then
    return v_emp;
  end if;

  -- Fallback: preferência persistida / único vínculo
  v_emp := public.get_preferred_empresa_for_user(v_uid);
  return v_emp; -- pode ser null
end;
$$;

-- 2) Permissões
revoke all on function public.current_empresa_id() from public, anon;
grant execute on function public.current_empresa_id() to authenticated, service_role, postgres;

-- 3) Notificar PostgREST
select pg_notify('pgrst','reload schema');
