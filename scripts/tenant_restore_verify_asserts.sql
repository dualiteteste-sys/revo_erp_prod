\set ON_ERROR_STOP on

-- RG: asserts mínimos pós-restore (tenant) — usado no restore drill (verify)
-- Entrada esperada:
--   psql -v empresa_id="<uuid>" -f scripts/tenant_restore_verify_asserts.sql

do $$
declare
  v_empresa uuid := :'empresa_id'::uuid;
  v_exists boolean;
begin
  select exists(select 1 from public.empresas where id = v_empresa) into v_exists;
  if not v_exists then
    raise exception 'ASSERT_FAIL: empresa % não encontrada em public.empresas', v_empresa;
  end if;

  if to_regclass('public.empresa_usuarios') is not null then
    select exists(select 1 from public.empresa_usuarios where empresa_id = v_empresa) into v_exists;
    if not v_exists then
      raise exception 'ASSERT_FAIL: empresa % sem memberships em public.empresa_usuarios', v_empresa;
    end if;
  end if;
end $$;

-- Informativo: assinatura pode não existir (ex.: tenant ainda sem checkout)
select
  'subscriptions_count' as check_name,
  count(*)::int as value
from public.subscriptions
where empresa_id = :'empresa_id'::uuid;

