-- Crie… suporte a override de sessão (apenas para testes) em current_user_id()

create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub text;
  v_id  uuid;
begin
  -- 0) Override opcional para testes (SQL Editor / jobs)
  v_sub := nullif(current_setting('app.current_user_id_override', true), '');
  if v_sub is not null then
    begin
      v_id := v_sub::uuid;
      return v_id;
    exception when others then
      -- se for inválido, ignora e segue fluxo normal
      v_id := null;
    end;
  end if;

  -- 1) PostgREST padrão
  select nullif(current_setting('request.jwt.claim.sub', true), '') into v_sub;

  -- 2) Claims completos (fallback)
  if v_sub is null then
    begin
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' into v_sub;
    exception when others then
      v_sub := null;
    end;
  end if;

  -- 3) GoTrue helper (fallback)
  if v_sub is null then
    select auth.uid()::text into v_sub;
  end if;

  -- 4) Retorna UUID (ou NULL)
  begin
    v_id := v_sub::uuid;
  exception when others then
    v_id := null;
  end;

  return v_id;
end;
$$;

-- ACL mínima (garante que apenas papéis esperados executem)
revoke all on function public.current_user_id() from public, anon;
grant execute on function public.current_user_id() to authenticated, service_role, postgres;
