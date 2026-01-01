/*
  INT-13: Testar conexão (diagnóstico)

  Objetivo:
  - Fornecer um "teste de conexão" simples para UI (sem expor tokens).
  - Retornar estado: conexão existe? status? tem token? expirou? último erro/sync?
*/

BEGIN;

drop function if exists public.ecommerce_connection_diagnostics(text);
create function public.ecommerce_connection_diagnostics(p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_conn record;
  v_has_secret boolean := false;
  v_access_token_present boolean := false;
  v_refresh_token_present boolean := false;
  v_expires_at timestamptz := null;
  v_expired boolean := false;
begin
  perform public.require_permission_for_current_user('ecommerce','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;
  if p_provider not in ('meli','shopee') then
    raise exception 'provider inválido' using errcode = '22023';
  end if;

  select
    e.id,
    e.empresa_id,
    e.provider,
    e.status,
    e.external_account_id,
    e.connected_at,
    e.last_sync_at,
    e.last_error,
    e.created_at,
    e.updated_at
  into v_conn
  from public.ecommerces e
  where e.empresa_id = v_empresa
    and e.provider = p_provider
  limit 1;

  if v_conn is not null then
    select true,
           (s.access_token is not null and length(s.access_token) > 0),
           (s.refresh_token is not null and length(s.refresh_token) > 0),
           s.token_expires_at
    into v_has_secret, v_access_token_present, v_refresh_token_present, v_expires_at
    from public.ecommerce_connection_secrets s
    where s.empresa_id = v_empresa
      and s.ecommerce_id = v_conn.id
    limit 1;

    v_expired := (v_expires_at is not null and v_expires_at <= now());
  end if;

  return jsonb_build_object(
    'provider', p_provider,
    'has_connection', (v_conn is not null),
    'status', coalesce(v_conn.status, 'disconnected'),
    'external_account_id', coalesce(v_conn.external_account_id, null),
    'connected_at', coalesce(v_conn.connected_at, null),
    'last_sync_at', coalesce(v_conn.last_sync_at, null),
    'last_error', coalesce(v_conn.last_error, null),
    'has_token', coalesce(v_access_token_present, false),
    'has_refresh_token', coalesce(v_refresh_token_present, false),
    'token_expires_at', v_expires_at,
    'token_expired', coalesce(v_expired, false)
  );
end;
$$;

revoke all on function public.ecommerce_connection_diagnostics(text) from public;
grant execute on function public.ecommerce_connection_diagnostics(text) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

