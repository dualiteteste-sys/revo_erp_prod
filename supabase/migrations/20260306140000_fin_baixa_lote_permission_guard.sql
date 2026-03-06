-- FIN-LOTE-02: Adicionar permission guard às funções de baixa em lote
-- Corrige falha no verify_financeiro_rpc_first.sql:
-- require_permission_for_current_user obrigatório em todas as funções financeiro_* SECURITY DEFINER.

BEGIN;

-- ============================================================
-- 1. financeiro_contas_pagar_pagar_lote (com permission guard)
-- ============================================================
CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_pagar_lote(
  p_ids               uuid[],
  p_data_pagamento    date    DEFAULT NULL,
  p_conta_corrente_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_settled int  := 0;
  v_skipped int  := 0;
  v_errors  jsonb := '[]'::jsonb;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.require_permission_for_current_user('contas_a_pagar', 'update');
  PERFORM public.require_permission_for_current_user('tesouraria', 'create');

  IF array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'settled', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    BEGIN
      PERFORM public.financeiro_conta_pagar_pagar_v2(
        v_id,
        p_data_pagamento,
        NULL,
        p_conta_corrente_id
      );
      v_settled := v_settled + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors  := v_errors || jsonb_build_array(
        jsonb_build_object('id', v_id::text, 'error', SQLERRM)
      );
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',      true,
    'settled', v_settled,
    'skipped', v_skipped,
    'errors',  v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_pagar_lote(uuid[], date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_pagar_lote(uuid[], date, uuid) TO authenticated, service_role;

-- ============================================================
-- 2. financeiro_contas_a_receber_receber_lote (com permission guard)
-- ============================================================
CREATE OR REPLACE FUNCTION public.financeiro_contas_a_receber_receber_lote(
  p_ids               uuid[],
  p_data_pagamento    date    DEFAULT NULL,
  p_conta_corrente_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_settled int  := 0;
  v_skipped int  := 0;
  v_errors  jsonb := '[]'::jsonb;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.require_permission_for_current_user('contas_a_receber', 'update');
  PERFORM public.require_permission_for_current_user('tesouraria', 'create');

  IF array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'settled', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    BEGIN
      PERFORM public.financeiro_conta_a_receber_receber_v2(
        v_id,
        p_data_pagamento,
        NULL,
        p_conta_corrente_id
      );
      v_settled := v_settled + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors  := v_errors || jsonb_build_array(
        jsonb_build_object('id', v_id::text, 'error', SQLERRM)
      );
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',      true,
    'settled', v_settled,
    'skipped', v_skipped,
    'errors',  v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_a_receber_receber_lote(uuid[], date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_a_receber_receber_lote(uuid[], date, uuid) TO authenticated, service_role;

COMMIT;
