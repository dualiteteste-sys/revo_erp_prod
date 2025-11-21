-- =====================================================================
-- Funções de contexto: SD + search_path + leitura segura de sub (JWT)
-- =====================================================================

-- public.current_user_id(): lê request.jwt.claim.sub com fallback claims->>'sub'
create or replace function public.current_user_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub_text    text;
  v_claims_text text;
  v_uid         uuid;
begin
  -- 1) request.jwt.claim.sub (texto direto)
  begin
    v_sub_text := nullif(current_setting('request.jwt.claim.sub', true), '');
  exception when others then
    v_sub_text := null;
  end;

  if v_sub_text is not null then
    begin
      v_uid := v_sub_text::uuid;
      return v_uid;
    exception when others then
      v_uid := null; -- segue para o fallback
    end;
  end if;

  -- 2) request.jwt.claims (json) -> 'sub'
  begin
    v_claims_text := nullif(current_setting('request.jwt.claims', true), '');
  exception when others then
    v_claims_text := null;
  end;

  if v_claims_text is not null then
    begin
      return ((v_claims_text::json ->> 'sub')::uuid);
    exception when others then
      return null;
    end;
  end if;

  -- 3) Sem JWT (ex.: SQL Editor) ou token inválido
  return null;
end
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to authenticated, service_role;

-- public.current_empresa_id(): resolve empresa ativa do usuário
create or replace function public.current_empresa_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select uae.empresa_id
    into v_emp
  from public.user_active_empresa uae
  where uae.user_id = v_uid
  order by uae.updated_at desc nulls last, uae.empresa_id
  limit 1;

  return v_emp;
end
$$;

revoke all on function public.current_empresa_id() from public;
grant execute on function public.current_empresa_id() to authenticated, service_role;
