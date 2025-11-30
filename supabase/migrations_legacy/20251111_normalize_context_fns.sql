-- =============================================================================
-- [Fix] Tornar public.current_user_id() e current_empresa_id() resilientes
-- Padrões: SECURITY DEFINER, search_path fixo, STABLE. Idempotente.
-- =============================================================================

-- 1) current_user_id(): lê request.jwt.claim.sub OU request.jwt.claims->>'sub'
create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_sub text;
  v_id  uuid;
begin
  -- 1.1) sub plano
  begin
    v_sub := nullif(current_setting('request.jwt.claim.sub', true), '');
  exception when others then
    v_sub := null;
  end;

  -- 1.2) fallback via claims JSON
  if v_sub is null then
    begin
      v_sub := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '');
    exception when others then
      v_sub := null;
    end;
  end if;

  -- 1.3) cast seguro para uuid
  begin
    v_id := v_sub::uuid;
  exception when others then
    v_id := null;
  end;

  return v_id;
end;
$fn$;

revoke all on function public.current_user_id() from public, anon;
grant execute on function public.current_user_id() to authenticated, service_role, postgres;

-- 2) Helper já criada antes:
--    public.get_preferred_empresa_for_user(p_user_id uuid)

-- 3) current_empresa_id(): GUC -> preferência persistida -> vínculo único
create or replace function public.current_empresa_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_emp uuid;
  v_uid uuid := public.current_user_id();
begin
  if v_uid is null then
    return null;
  end if;

  -- 3.1) tenta GUC do request
  begin
    v_emp := nullif(current_setting('app.current_empresa_id', true), '')::uuid;
  exception when others then
    v_emp := null;
  end;

  if v_emp is not null then
    return v_emp;
  end if;

  -- 3.2) fallback persistido / vínculo único
  v_emp := public.get_preferred_empresa_for_user(v_uid);
  return v_emp; -- pode ser null
end;
$fn$;

revoke all on function public.current_empresa_id() from public, anon;
grant execute on function public.current_empresa_id() to authenticated, service_role, postgres;

-- 4) Notificar PostgREST
select pg_notify('pgrst','reload schema');
