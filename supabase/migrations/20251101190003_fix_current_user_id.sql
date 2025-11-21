-- Crie… implementação robusta de current_user_id()

create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub text;
  v_id uuid;
begin
  -- 1) Formato mais comum (postgrest 10+)
  select nullif(current_setting('request.jwt.claim.sub', true), '') into v_sub;

  -- 2) Fallback: claims serializados (alguns proxies/versões)
  if v_sub is null then
    begin
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' into v_sub;
    exception when others then
      -- ignora cast errors
      v_sub := null;
    end;
  end if;

  -- 3) Fallback GoTrue helper (quando disponível)
  if v_sub is null then
    select auth.uid()::text into v_sub;
  end if;

  -- 4) Retorno como UUID (ou NULL se indisponível)
  begin
    v_id := v_sub::uuid;
  exception when others then
    v_id := null;
  end;

  return v_id;
end;
$$;

-- Permissões mínimas
revoke all on function public.current_user_id() from public, anon;
grant execute on function public.current_user_id() to authenticated, service_role, postgres;
