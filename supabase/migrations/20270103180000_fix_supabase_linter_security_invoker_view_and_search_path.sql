/*
  Supabase Database Linter (PROD) — correções para:
  - 0010 security_definer_view: view `public.industria_roteiro_etapas`
  - 0011 function_search_path_mutable: funções sem `search_path` fixo

  Motivo:
  - Views (por padrão) executam com permissões do owner; em PG15+ podemos usar `security_invoker=true`
    para garantir que RLS/permissions do usuário chamador sejam respeitadas.
  - Funções sem `search_path` fixo podem ser exploradas via objetos com o mesmo nome em schemas injetados.

  Impacto:
  - Remove o erro do linter para a view (em PG15+).
  - Remove warnings de `function_search_path_mutable` para as funções listadas.

  Reversibilidade:
  - Reversível recriando a view sem `security_invoker` e/ou removendo `proconfig` das funções.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- View: recriar como SECURITY INVOKER (PG15+)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_ver int := current_setting('server_version_num')::int;
BEGIN
  IF to_regclass('public.industria_roteiro_etapas') IS NULL THEN
    RETURN;
  END IF;

  IF v_ver < 150000 THEN
    RAISE NOTICE 'Skipping security_invoker view option (PG < 15).';
    RETURN;
  END IF;

  -- Recria explicitamente com options, garantindo que a reloption fique persistida.
  EXECUTE $v$
    CREATE OR REPLACE VIEW public.industria_roteiro_etapas
    WITH (security_invoker = true, security_barrier = true)
    AS
    SELECT
      e.id,
      e.empresa_id,
      e.roteiro_id,
      e.sequencia,
      e.nome,
      e.centro_trabalho_id,
      e.descricao,
      e.tempo_setup,
      e.tempo_operacao,
      e.created_at,
      e.updated_at
    FROM public.industria_roteiros_etapas e
  $v$;

  -- Mantém comentário canônico (idempotente).
  EXECUTE $$COMMENT ON VIEW public.industria_roteiro_etapas IS 'Canonical view for roteiro stages'$$;
END $$;

-- -----------------------------------------------------------------------------
-- Functions: fixar search_path (evita role-mutable search_path)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.empresa_role_rank(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.empresa_role_rank(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.current_jwt_role()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.current_jwt_role() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.is_service_role()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.is_service_role() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.normalize_empresa_role(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.normalize_empresa_role(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.set_updated_at_timestamp()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.set_updated_at_timestamp() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.tg_set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.tg_set_updated_at() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.partners_search_match(public.pessoas,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.partners_search_match(public.pessoas,text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.os_calc_item_total(numeric,numeric,numeric)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_calc_item_total(numeric,numeric,numeric) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.plano_mvp_allows(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.plano_mvp_allows(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.fiscal_digits_only(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.fiscal_digits_only(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.fiscal_xml_escape(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.fiscal_xml_escape(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public.tg_vendas_expedicoes_autofill_dates()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.tg_vendas_expedicoes_autofill_dates() SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public._ind01_normalize_status(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind01_normalize_status(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public._ind02_op_status_to_ui(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind02_op_status_to_ui(text) SET search_path TO pg_catalog, public';
  END IF;
  IF to_regprocedure('public._ind02_op_status_to_db(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._ind02_op_status_to_db(text) SET search_path TO pg_catalog, public';
  END IF;
END $$;

-- Recarregar cache do PostgREST (RPCs/views).
select pg_notify('pgrst', 'reload schema');

-- -----------------------------------------------------------------------------
-- Verificação (somente leitura)
-- -----------------------------------------------------------------------------
-- View options (reloptions) devem incluir `security_invoker=true` em PG15+.
select c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'industria_roteiro_etapas';

-- Funções: proconfig deve conter `search_path=pg_catalog, public` quando aplicável.
select p.proname, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'empresa_role_rank',
    'current_jwt_role',
    'is_service_role',
    'normalize_empresa_role',
    'set_updated_at_timestamp',
    'tg_set_updated_at',
    'partners_search_match',
    'os_calc_item_total',
    'plano_mvp_allows',
    'fiscal_digits_only',
    'fiscal_xml_escape',
    'tg_vendas_expedicoes_autofill_dates',
    '_ind01_normalize_status',
    '_ind02_op_status_to_ui',
    '_ind02_op_status_to_db'
  )
order by p.proname;

COMMIT;

