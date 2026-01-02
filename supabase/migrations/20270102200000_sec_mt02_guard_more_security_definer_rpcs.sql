/*
  SEC-MT-02: Guard em RPCs SECURITY DEFINER expostas ao app

  Objetivo:
  - Evitar "burla via console": funções SECURITY DEFINER (bypass RLS) chamadas pelo app devem exigir permissão.
  - Complementa a migration SEC-02 antiga (que dropa o helper), cobrindo RPCs adicionadas depois.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Garantir permissões necessárias (idempotente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.permissions') IS NULL OR to_regclass('public.roles') IS NULL OR to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  -- `permissions.action` pode não ter 'export' ainda; nesta migration usamos apenas ações existentes.
  INSERT INTO public.permissions(module, action) VALUES
    ('logs','create'),
    ('fiscal','view'),('fiscal','create'),('fiscal','update'),('fiscal','delete'),('fiscal','manage')
  ON CONFLICT (module, action) DO NOTHING;

  -- `logs:create` é safe para todos: permite apenas registrar telemetria (sem leitura).
  INSERT INTO public.role_permissions(role_id, permission_id, allow)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permissions p ON (p.module='logs' AND p.action='create')
  ON CONFLICT DO NOTHING;

  -- `fiscal:*`: padrão conservador (similar a vendas) para não quebrar fluxo atual.
  INSERT INTO public.role_permissions(role_id, permission_id, allow)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permissions p
    ON p.module='fiscal'
   AND (
     (r.slug IN ('OWNER','ADMIN') AND p.action IN ('view','create','update','delete','manage')) OR
     (r.slug IN ('MEMBER','OPS') AND p.action IN ('view','create','update')) OR
     (r.slug IN ('FINANCE','VIEWER') AND p.action IN ('view'))
   )
  ON CONFLICT DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Helper: wrap SECURITY DEFINER functions (por nome) com guard + revoke bypass
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sec_mt02_wrap_guard(p_fn text, p_module text, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
  args_identity text;
  args_decl text;
  nargs int;
  call_args text;
  result text;
  retset bool;
  sig text;
  underlying_sig text;
  oid_under oid;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = p_fn
  LOOP
    IF r.prosecdef IS NOT TRUE THEN
      CONTINUE;
    END IF;

    IF pg_get_functiondef(r.oid) ILIKE '%require_permission_for_current_user%' THEN
      CONTINUE;
    END IF;

    args_identity := (
      SELECT COALESCE(string_agg(pg_catalog.format_type(t, NULL), ', ' ORDER BY i), '')
      FROM unnest((SELECT proargtypes FROM pg_proc WHERE oid = r.oid)) WITH ORDINALITY AS u(t, i)
    );
    sig := format('public.%I(%s)', p_fn, args_identity);
    underlying_sig := format('public.%I(%s)', '_' || p_fn, args_identity);

    IF to_regprocedure(underlying_sig) IS NULL THEN
      EXECUTE format('ALTER FUNCTION %s RENAME TO %I', sig, '_' || p_fn);
    END IF;

    oid_under := to_regprocedure(underlying_sig);
    IF oid_under IS NULL THEN
      CONTINUE;
    END IF;

    args_decl := pg_get_function_arguments(oid_under);
    nargs := (SELECT pronargs FROM pg_proc WHERE oid = oid_under);
    call_args := (
      SELECT COALESCE(string_agg(format('$%s', i), ', '), '')
      FROM generate_series(1, nargs) AS s(i)
    );
    result := pg_get_function_result(oid_under);
    retset := (SELECT proretset FROM pg_proc WHERE oid = oid_under);

    IF retset THEN
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION public.%1$I(%2$s) RETURNS %3$s LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$ ' ||
        'BEGIN PERFORM public.require_permission_for_current_user(%4$L, %5$L); ' ||
        'RETURN QUERY SELECT * FROM public.%6$I(%7$s); END; $fn$;',
        p_fn, args_decl, result, p_module, p_action, '_' || p_fn, call_args
      );
    ELSIF result = 'void' THEN
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION public.%1$I(%2$s) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$ ' ||
        'BEGIN PERFORM public.require_permission_for_current_user(%4$L, %5$L); ' ||
        'PERFORM public.%6$I(%7$s); END; $fn$;',
        p_fn, args_decl, result, p_module, p_action, '_' || p_fn, call_args
      );
    ELSE
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION public.%1$I(%2$s) RETURNS %3$s LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$ ' ||
        'BEGIN PERFORM public.require_permission_for_current_user(%4$L, %5$L); ' ||
        'RETURN public.%6$I(%7$s); END; $fn$;',
        p_fn, args_decl, result, p_module, p_action, '_' || p_fn, call_args
      );
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', '_' || p_fn, args_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', '_' || p_fn, args_identity);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Aplicar guards para RPCs usadas pelo app que ainda estavam "abertas"
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Suprimentos (XML -> recebimento)
  PERFORM public._sec_mt02_wrap_guard('create_recebimento_from_xml', 'suprimentos', 'create');

  -- Cadastros: grupos de produtos (RPCs)
  PERFORM public._sec_mt02_wrap_guard('list_produto_grupos', 'produtos', 'view');
  PERFORM public._sec_mt02_wrap_guard('upsert_produto_grupo', 'produtos', 'update');
  PERFORM public._sec_mt02_wrap_guard('delete_produto_grupo', 'produtos', 'delete');

  -- Produtos: imagens
  PERFORM public._sec_mt02_wrap_guard('delete_product_image_db', 'produtos', 'update');
  PERFORM public._sec_mt02_wrap_guard('set_principal_product_image', 'produtos', 'update');

  -- Indústria: execução (apontamento)
  PERFORM public._sec_mt02_wrap_guard('industria_operacao_apontar_execucao', 'industria', 'update');

  -- Fiscal (motor/preview)
  PERFORM public._sec_mt02_wrap_guard('fiscal_nfe_preview_xml', 'fiscal', 'view');
  PERFORM public._sec_mt02_wrap_guard('fiscal_nfe_recalc_totais', 'fiscal', 'update');

  -- Observabilidade: logs/traces (telemetria)
  PERFORM public._sec_mt02_wrap_guard('log_app_event', 'logs', 'create');
  PERFORM public._sec_mt02_wrap_guard('log_app_trace', 'logs', 'create');
END $$;

DROP FUNCTION public._sec_mt02_wrap_guard(text, text, text);

COMMIT;

