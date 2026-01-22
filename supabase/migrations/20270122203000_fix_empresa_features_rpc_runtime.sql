/*
  Fix PROD: empresa_features_get 400 (42703) "column f.updated_at does not exist"

  Causa raiz:
  - O RPC `empresa_features_get` (e `empresa_features_set`) referenciava `public.empresa_features` como se fosse
    uma tabela com `updated_at`, porém em alguns ambientes `public.empresa_features` ainda é uma VIEW legada
    (não possui `updated_at`/`max_nfe_monthly` e não é atualizável).

  Solução:
  - Tornar os RPCs independentes da view, calculando features a partir das tabelas base:
    `empresa_entitlements`, `empresa_feature_flags`, `empresa_addons`.
*/

begin;

-- -----------------------------------------------------------------------------
-- RPC: empresa_features_get (member)
-- -----------------------------------------------------------------------------
drop function if exists public.empresa_features_get();
create or replace function public.empresa_features_get()
returns table(
  revo_send_enabled boolean,
  nfe_emissao_enabled boolean,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  servicos_enabled boolean,
  industria_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_plano text;
  v_max_users int;
  v_max_nfe int;
  v_ent_updated timestamptz;
  v_nfe_enabled boolean;
  v_ff_updated timestamptz;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  perform public.assert_empresa_role_at_least('member');

  select
    coalesce(ent.plano_mvp, 'ambos')::text,
    coalesce(ent.max_users, 999)::int,
    coalesce(ent.max_nfe_monthly, 999)::int,
    ent.updated_at
  into v_plano, v_max_users, v_max_nfe, v_ent_updated
  from public.empresa_entitlements ent
  where ent.empresa_id = v_empresa;

  if not found then
    v_plano := 'ambos';
    v_max_users := 999;
    v_max_nfe := 999;
    v_ent_updated := null;
  end if;

  select
    coalesce(ff.nfe_emissao_enabled, false),
    ff.updated_at
  into v_nfe_enabled, v_ff_updated
  from public.empresa_feature_flags ff
  where ff.empresa_id = v_empresa;

  if not found then
    v_nfe_enabled := false;
    v_ff_updated := null;
  end if;

  return query
  select
    exists (
      select 1
      from public.empresa_addons ea
      where ea.empresa_id = v_empresa
        and ea.addon_slug = 'REVO_SEND'
        and ea.status = any (array['active'::text, 'trialing'::text])
        and coalesce(ea.cancel_at_period_end, false) = false
    ) as revo_send_enabled,
    v_nfe_enabled as nfe_emissao_enabled,
    v_plano as plano_mvp,
    v_max_users as max_users,
    v_max_nfe as max_nfe_monthly,
    (v_plano in ('servicos','ambos')) as servicos_enabled,
    (v_plano in ('industria','ambos')) as industria_enabled,
    coalesce(greatest(v_ent_updated, v_ff_updated), v_ent_updated, v_ff_updated, now()) as updated_at;
end;
$$;

revoke all on function public.empresa_features_get() from public, anon;
grant execute on function public.empresa_features_get() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: empresa_features_set (admin) — patch parcial em entitlements/feature_flags
-- -----------------------------------------------------------------------------
drop function if exists public.empresa_features_set(jsonb);
create or replace function public.empresa_features_set(
  p_patch jsonb
)
returns table(
  revo_send_enabled boolean,
  nfe_emissao_enabled boolean,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  servicos_enabled boolean,
  industria_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_plano text;
  v_max_users int;
  v_max_nfe int;
  v_ent_updated timestamptz;
  v_nfe_enabled boolean;
  v_ff_updated timestamptz;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  perform public.assert_empresa_role_at_least('admin');

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Payload inválido.' using errcode='22023';
  end if;

  -- Base atual (com defaults)
  select
    coalesce(ent.plano_mvp, 'ambos')::text,
    coalesce(ent.max_users, 999)::int,
    coalesce(ent.max_nfe_monthly, 999)::int,
    ent.updated_at
  into v_plano, v_max_users, v_max_nfe, v_ent_updated
  from public.empresa_entitlements ent
  where ent.empresa_id = v_empresa;

  if not found then
    v_plano := 'ambos';
    v_max_users := 999;
    v_max_nfe := 999;
    v_ent_updated := null;
  end if;

  select
    coalesce(ff.nfe_emissao_enabled, false),
    ff.updated_at
  into v_nfe_enabled, v_ff_updated
  from public.empresa_feature_flags ff
  where ff.empresa_id = v_empresa;

  if not found then
    v_nfe_enabled := false;
    v_ff_updated := null;
  end if;

  -- Aplica patch (parcial)
  v_plano := coalesce(nullif(btrim(p_patch->>'plano_mvp'), ''), v_plano);
  v_max_users := coalesce(nullif(p_patch->>'max_users','')::int, v_max_users);
  v_max_nfe := coalesce(nullif(p_patch->>'max_nfe_monthly','')::int, v_max_nfe);
  v_nfe_enabled := coalesce((p_patch->>'nfe_emissao_enabled')::boolean, v_nfe_enabled);

  if v_plano not in ('servicos','industria','ambos') then
    raise exception 'Plano MVP inválido.' using errcode='22023';
  end if;
  if v_max_users < 1 then
    raise exception 'max_users inválido.' using errcode='22023';
  end if;
  if v_max_nfe < 0 then
    raise exception 'max_nfe_monthly inválido.' using errcode='22023';
  end if;

  -- Persist entitlements
  insert into public.empresa_entitlements as ent (empresa_id, plano_mvp, max_users, max_nfe_monthly)
  values (v_empresa, v_plano, v_max_users, v_max_nfe)
  on conflict (empresa_id) do update
    set plano_mvp = excluded.plano_mvp,
        max_users = excluded.max_users,
        max_nfe_monthly = excluded.max_nfe_monthly,
        updated_at = now();

  -- Persist flag (upsert)
  insert into public.empresa_feature_flags as ff (empresa_id, nfe_emissao_enabled)
  values (v_empresa, v_nfe_enabled)
  on conflict (empresa_id) do update
    set nfe_emissao_enabled = excluded.nfe_emissao_enabled,
        updated_at = now();

  return query
  select * from public.empresa_features_get();
end;
$$;

revoke all on function public.empresa_features_set(jsonb) from public, anon;
grant execute on function public.empresa_features_set(jsonb) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

