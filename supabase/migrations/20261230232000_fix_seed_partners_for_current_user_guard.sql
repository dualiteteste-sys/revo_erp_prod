/*
  Fix: PROD drift + security hardening
  - PROD tinha `_seed_partners_for_current_user()` extra vs schema esperado.
  - Além disso, migrations posteriores recriaram `seed_partners_for_current_user()` sem o guard de permissão.

  Estratégia:
  - Padroniza a existência de `_seed_partners_for_current_user()` em todos ambientes.
  - Garante permissão `partners.manage` ao popular dados (seed) via RPC.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public._seed_partners_for_current_user()
RETURNS SETOF public.pessoas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('partners', 'manage');

  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[SEED][PARTNERS] empresa_id inválido para a sessão' USING errcode='42501';
  END IF;

  RETURN QUERY SELECT * FROM public._seed_partners_for_empresa(v_emp);
END;
$$;

REVOKE ALL ON FUNCTION public._seed_partners_for_current_user() FROM public;
GRANT EXECUTE ON FUNCTION public._seed_partners_for_current_user() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seed_partners_for_current_user()
RETURNS SETOF public.pessoas
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM public._seed_partners_for_current_user();
$$;

REVOKE ALL ON FUNCTION public.seed_partners_for_current_user() FROM public;
GRANT EXECUTE ON FUNCTION public.seed_partners_for_current_user() TO authenticated, service_role;

COMMIT;

