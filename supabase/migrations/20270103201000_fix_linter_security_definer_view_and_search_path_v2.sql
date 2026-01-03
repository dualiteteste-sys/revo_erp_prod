/*
  Supabase Database Linter (PROD) — ajuste final para:
  - 0010 security_definer_view: view `public.industria_roteiro_etapas`
  - 0011 function_search_path_mutable: funções sem `search_path` fixo

  Por que existe:
  - Alguns ambientes podem ter variações de assinatura (overloads) nas funções listadas, e o ALTER FUNCTION
    precisa da assinatura exata. Esta migration aplica `search_path` para TODAS as variantes encontradas
    no schema `public` com os nomes apontados pelo linter.
  - Garante que a view `public.industria_roteiro_etapas` esteja configurada como SECURITY INVOKER (PG15+),
    evitando que execute com permissões do owner (comportamento tipo "security definer").

  Impacto:
  - Remove o erro/warnings do linter, sem alterar schema (apenas options/config).

  Reversibilidade:
  - Reversível removendo `search_path` via `ALTER FUNCTION ... RESET ALL` e/ou resetando reloptions da view.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- View: garantir SECURITY INVOKER (PG15+) e SECURITY BARRIER
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_ver int := current_setting('server_version_num')::int;
BEGIN
  IF to_regclass('public.industria_roteiro_etapas') IS NULL THEN
    RETURN;
  END IF;

  -- `security_invoker` existe a partir do PG15.
  IF v_ver >= 150000 THEN
    EXECUTE 'ALTER VIEW public.industria_roteiro_etapas SET (security_invoker = true)';
  END IF;

  -- Mantém barreira de segurança para evitar pushdown indevido (defesa extra).
  EXECUTE 'ALTER VIEW public.industria_roteiro_etapas SET (security_barrier = true)';
END $$;

-- -----------------------------------------------------------------------------
-- Functions: fixar search_path para todas as assinaturas existentes no schema public
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
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
      ])
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path TO pg_catalog, public',
      r.nspname,
      r.proname,
      r.args
    );
  END LOOP;
END $$;

-- Recarregar cache do PostgREST (RPCs/views).
select pg_notify('pgrst', 'reload schema');

-- -----------------------------------------------------------------------------
-- Verificação (somente leitura)
-- -----------------------------------------------------------------------------
select c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'industria_roteiro_etapas';

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
