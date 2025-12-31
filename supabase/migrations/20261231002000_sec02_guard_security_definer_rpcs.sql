/*
  SEC-02: Permissões por ação (enforcement no DB)

  Objetivo:
  - Evitar "burla via console": RPCs SECURITY DEFINER chamados pelo app precisam exigir permissão.
  - Estratégia: renomeia implementação existente para `_fn` e cria wrapper `fn` com require_permission_for_current_user.
  - Hardening: revoga EXECUTE do `_fn` para authenticated (evita chamar `_fn` diretamente via PostgREST).
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Garantir módulos de permissão para RPCs já usadas pelo app (idempotente)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions(module, action) VALUES
  ('crm','view'),('crm','create'),('crm','update'),('crm','delete'),('crm','manage'),
  ('industria','view'),('industria','create'),('industria','update'),('industria','delete'),('industria','manage'),
  ('qualidade','view'),('qualidade','create'),('qualidade','update'),('qualidade','delete'),('qualidade','manage'),
  ('logistica','view'),('logistica','create'),('logistica','update'),('logistica','delete'),('logistica','manage'),
  ('mrp','view'),('mrp','create'),('mrp','update'),('mrp','delete'),('mrp','manage'),
  ('metas','view'),('metas','create'),('metas','update'),('metas','delete'),('metas','manage')
ON CONFLICT (module, action) DO NOTHING;

-- OWNER/ADMIN: sempre tudo liberado (inclui módulos novos)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON true
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- MVP padrão para novos módulos (conservador)
-- MEMBER/OPS: view + create/update (sem delete/manage)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON p.module IN ('crm','industria','qualidade','logistica','mrp','metas')
 AND p.action IN ('view','create','update')
WHERE r.slug IN ('MEMBER','OPS')
ON CONFLICT DO NOTHING;

-- FINANCE/VIEWER: somente view
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON p.module IN ('crm','industria','qualidade','logistica','mrp','metas')
 AND p.action = 'view'
WHERE r.slug IN ('FINANCE','VIEWER')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2) Helper: wrap SECURITY DEFINER functions (por nome) com guard + revoke bypass
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sec02_wrap_guard(p_fn text, p_module text, p_action text)
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
    -- Só faz sentido para SECURITY DEFINER (bypass RLS)
    IF r.prosecdef IS NOT TRUE THEN
      CONTINUE;
    END IF;

    -- Se já tem guard, não mexe (mantém backward compatible)
    IF pg_get_functiondef(r.oid) ILIKE '%require_permission_for_current_user%' THEN
      CONTINUE;
    END IF;

    -- to_regprocedure/ALTER FUNCTION precisam de assinatura por tipos (sem nomes).
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
        'BEGIN PERFORM public.require_permission_for_current_user(%3$L, %4$L); ' ||
        'PERFORM public.%5$I(%6$s); END; $fn$;',
        p_fn, args_decl, p_module, p_action, '_' || p_fn, call_args
      );
    ELSE
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION public.%1$I(%2$s) RETURNS %3$s LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$ ' ||
        'BEGIN PERFORM public.require_permission_for_current_user(%4$L, %5$L); ' ||
        'RETURN public.%6$I(%7$s); END; $fn$;',
        p_fn, args_decl, result, p_module, p_action, '_' || p_fn, call_args
      );
    END IF;

    -- Wrapper: executável por authenticated + service_role
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM public', p_fn, args_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', p_fn, args_identity);

    -- Underlying: não pode ser chamado direto pelo client
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM public', '_' || p_fn, args_identity);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', '_' || p_fn, args_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', '_' || p_fn, args_identity);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Aplicar guards (lista baseada nos RPCs usados pelo app)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Suprimentos / Compras / Recebimentos / Estoque
  PERFORM public._sec02_wrap_guard('compras_manage_item', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('compras_receber_pedido', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('conferir_item_recebimento', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('finalizar_recebimento', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('recebimento_set_classificacao', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('recebimento_sync_materiais_cliente', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('recebimento_cancelar', 'suprimentos', 'update');
  PERFORM public._sec02_wrap_guard('recebimento_delete', 'suprimentos', 'delete');

  -- Produtos
  PERFORM public._sec02_wrap_guard('delete_product_for_current_user', 'produtos', 'delete');

  -- Vendas
  PERFORM public._sec02_wrap_guard('vendas_manage_item', 'vendas', 'update');
  PERFORM public._sec02_wrap_guard('vendas_aprovar_pedido', 'vendas', 'manage');

  -- Financeiro (faltantes)
  PERFORM public._sec02_wrap_guard('financeiro_cobrancas_bancarias_delete', 'tesouraria', 'delete');
  PERFORM public._sec02_wrap_guard('financeiro_conta_pagar_estornar', 'contas_a_pagar', 'update');
  PERFORM public._sec02_wrap_guard('financeiro_conta_pagar_estornar_v2', 'contas_a_pagar', 'update');

  -- Metas
  PERFORM public._sec02_wrap_guard('delete_meta_venda', 'metas', 'delete');

  -- CRM
  PERFORM public._sec02_wrap_guard('crm_ensure_default_pipeline', 'crm', 'manage');
  PERFORM public._sec02_wrap_guard('crm_move_oportunidade', 'crm', 'update');
  PERFORM public._sec02_wrap_guard('crm_upsert_oportunidade', 'crm', 'update');
  PERFORM public._sec02_wrap_guard('crm_delete_oportunidade', 'crm', 'delete');

  -- Logística
  PERFORM public._sec02_wrap_guard('logistica_transportadoras_delete', 'logistica', 'delete');

  -- Indústria
  PERFORM public._sec02_wrap_guard('industria_ct_aps_config_upsert', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_ct_calendario_upsert', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_operacao_aps_lock_set', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_operacao_replanejar', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_operacao_update_status', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_operacao_doc_delete', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_operador_delete', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_materiais_cliente_delete', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_roteiros_manage_etapa', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_update_ordem_status', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_delete_ordem', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_manage_componente', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_manage_entrega', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_bom_manage_componente', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_bom_delete', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_aplicar_bom_em_ordem_producao', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_aplicar_bom_em_ordem_beneficiamento', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_automacao_upsert', 'industria', 'update');

  PERFORM public._sec02_wrap_guard('industria_producao_update_status', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_manage_componente', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_manage_entrega', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_gerar_operacoes', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_registrar_evento', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_apontar_producao', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_delete_apontamento', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_producao_transferir_lote', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_reservar', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_consumir', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_registrar_entrega', 'industria', 'update');
  PERFORM public._sec02_wrap_guard('industria_producao_fechar', 'industria', 'manage');
  PERFORM public._sec02_wrap_guard('industria_producao_ordens_delete', 'industria', 'delete');
  PERFORM public._sec02_wrap_guard('industria_producao_reset_ordem', 'industria', 'manage');
  PERFORM public._sec02_wrap_guard('industria_producao_reset_operacao', 'industria', 'manage');
  PERFORM public._sec02_wrap_guard('industria_producao_set_qa_requirements', 'industria', 'update');

  -- Qualidade
  PERFORM public._sec02_wrap_guard('qualidade_adicionar_motivo', 'qualidade', 'create');
  PERFORM public._sec02_wrap_guard('qualidade_excluir_motivo', 'qualidade', 'delete');
  PERFORM public._sec02_wrap_guard('qualidade_planos_delete', 'qualidade', 'delete');
  PERFORM public._sec02_wrap_guard('qualidade_plano_delete_caracteristica', 'qualidade', 'delete');
  PERFORM public._sec02_wrap_guard('qualidade_registrar_inspecao', 'qualidade', 'create');
  PERFORM public._sec02_wrap_guard('qualidade_alterar_status_lote', 'qualidade', 'update');

  -- MRP
  PERFORM public._sec02_wrap_guard('mrp_reprocessar_ordem', 'mrp', 'manage');
END $$;

DROP FUNCTION public._sec02_wrap_guard(text, text, text);

COMMIT;
