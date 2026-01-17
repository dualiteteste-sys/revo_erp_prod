\set ON_ERROR_STOP on

-- RG: asserts mínimos pós-restore (tenant) — usado no restore drill (verify)
-- Entrada esperada:
--   psql -v empresa_id="<uuid>" -f scripts/tenant_restore_verify_asserts.sql

select count(*)::int as empresas_count
from public.empresas
where id = :'empresa_id'::uuid;
\gset

\if :empresas_count = 0
  \echo 'ASSERT_FAIL: empresa não encontrada em public.empresas'
  \quit 3
\endif

select (to_regclass('public.empresa_usuarios') is not null) as has_empresa_usuarios;
\gset

\if :has_empresa_usuarios = 't'
  select count(*)::int as memberships_count
  from public.empresa_usuarios
  where empresa_id = :'empresa_id'::uuid;
  \gset

  \if :memberships_count = 0
    \echo 'ASSERT_FAIL: empresa sem memberships em public.empresa_usuarios'
    \quit 3
  \endif
\endif

-- Informativo: assinatura pode não existir (ex.: tenant ainda sem checkout)
select
  'subscriptions_count' as check_name,
  count(*)::int as value
from public.subscriptions
where empresa_id = :'empresa_id'::uuid;
