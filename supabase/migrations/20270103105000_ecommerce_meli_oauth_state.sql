/*
  MELI-01 / SHO-01: OAuth state (CSRF) + vínculo com ecommerce_id

  Objetivo:
  - Criar/validar "state" do OAuth sem depender do frontend para persistência.
  - Callback (service_role) consome state e grava tokens em ecommerce_connection_secrets.
*/

BEGIN;

create extension if not exists pgcrypto;

create table if not exists public.ecommerce_oauth_states (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  provider text not null,
  user_id uuid not null,
  state text not null,
  redirect_to text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz null,
  constraint ecommerce_oauth_states_provider_check check (provider in ('meli','shopee')),
  constraint ecommerce_oauth_states_state_unique unique (provider, state)
);

alter table public.ecommerce_oauth_states enable row level security;

drop policy if exists ecommerce_oauth_states_select on public.ecommerce_oauth_states;
create policy ecommerce_oauth_states_select
  on public.ecommerce_oauth_states
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and user_id = auth.uid()
    and public.has_permission_for_current_user('ecommerce','manage')
  );

drop policy if exists ecommerce_oauth_states_write_service_role on public.ecommerce_oauth_states;
create policy ecommerce_oauth_states_write_service_role
  on public.ecommerce_oauth_states
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_oauth_states to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_oauth_states to service_role;

create index if not exists idx_ecommerce_oauth_states_empresa_created
  on public.ecommerce_oauth_states (empresa_id, created_at desc);

-- Cria state e garante que existe conexão (ecommerces) para o provider.
drop function if exists public.ecommerce_oauth_create_state(text, text);
create function public.ecommerce_oauth_create_state(p_provider text, p_redirect_to text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_provider text := lower(coalesce(p_provider,''));
  v_redirect text := coalesce(nullif(trim(p_redirect_to),''), '/app/configuracoes/ecommerce/marketplaces');
  v_ecommerce public.ecommerces;
  v_state text;
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null or v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if v_provider not in ('meli','shopee') then
    raise exception 'provider inválido' using errcode = '22023';
  end if;

  select * into v_ecommerce
  from public.ecommerces
  where empresa_id = v_empresa and provider = v_provider
  limit 1;

  if v_ecommerce.id is null then
    insert into public.ecommerces (empresa_id, nome, provider, status, config)
    values (
      v_empresa,
      case when v_provider = 'meli' then 'Mercado Livre' else 'Shopee' end,
      v_provider,
      'pending',
      '{}'::jsonb
    )
    returning * into v_ecommerce;
  end if;

  v_state := encode(gen_random_bytes(16), 'hex');

  insert into public.ecommerce_oauth_states(empresa_id, ecommerce_id, provider, user_id, state, redirect_to)
  values (v_empresa, v_ecommerce.id, v_provider, v_user, v_state, v_redirect);

  return jsonb_build_object(
    'provider', v_provider,
    'state', v_state,
    'redirect_to', v_redirect,
    'ecommerce_id', v_ecommerce.id
  );
end;
$$;

revoke all on function public.ecommerce_oauth_create_state(text, text) from public;
grant execute on function public.ecommerce_oauth_create_state(text, text) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

