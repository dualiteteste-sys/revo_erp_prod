-- FIN-LOTE-01: Baixa em lote de contas a pagar e a receber
-- Dois RPCs que iteram sobre um array de IDs chamando as funções v2 existentes,
-- com isolamento de erros por item (falha num não cancela os demais).
-- Idempotente: v2 usa ON CONFLICT DO NOTHING em (empresa_id, origem_tipo, origem_id).

BEGIN;

-- ============================================================
-- 1. financeiro_contas_pagar_pagar_lote
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

  IF array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'settled', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    BEGIN
      -- p_valor_pago = NULL → v2 usa coalesce(NULL, v_total) = saldo total do item
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
-- 2. financeiro_contas_a_receber_receber_lote
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

  IF array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'settled', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    BEGIN
      -- p_valor_pago = NULL → v2 usa coalesce(NULL, rec.valor) = valor total do item
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
