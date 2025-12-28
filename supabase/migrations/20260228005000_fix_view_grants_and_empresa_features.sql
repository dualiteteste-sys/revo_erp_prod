/*
  Fix: PostgREST 403/400 em DEV

  - `empresa_features` foi drop/recriada em align_dev_schema sem grants e sem security_invoker
  - Views novas precisam de GRANT explícito para PostgREST (role authenticated)
*/

BEGIN;

-- Recria view com opções corretas
create or replace view public.empresa_features
with (security_invoker = true, security_barrier = true)
as
select
  e.id as empresa_id,
  exists (
    select 1
    from public.empresa_addons ea
    where ea.empresa_id = e.id
      and ea.addon_slug = 'REVO_SEND'
      and ea.status = any (array['active'::text, 'trialing'::text])
      and coalesce(ea.cancel_at_period_end, false) = false
  ) as revo_send_enabled,
  coalesce(ef.nfe_emissao_enabled, false) as nfe_emissao_enabled,
  coalesce(ent.plano_mvp, 'ambos') as plano_mvp,
  coalesce(ent.max_users, 999) as max_users,
  (coalesce(ent.plano_mvp, 'ambos') in ('servicos', 'ambos')) as servicos_enabled,
  (coalesce(ent.plano_mvp, 'ambos') in ('industria', 'ambos')) as industria_enabled
from public.empresas e
left join public.empresa_feature_flags ef
  on ef.empresa_id = e.id
left join public.empresa_entitlements ent
  on ent.empresa_id = e.id
where exists (
  select 1
  from public.empresa_usuarios eu
  where eu.empresa_id = e.id
    and eu.user_id = public.current_user_id()
);

-- GRANT no view (e views novas usadas pelo app)
grant select on public.empresa_features to authenticated, service_role;
grant select on public.fiscal_nfe_audit_timeline to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

COMMIT;

