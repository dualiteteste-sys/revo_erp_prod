/*
  OBS-MET-02 (P1): KPIs de negócio — funil (setup → 1ª venda → 1ª NF → 1º pagamento)

  Objetivo
  - Dar visibilidade para a empresa (e time ops/dev) sobre progresso real de ativação,
    reduzindo suporte e ajudando diagnóstico.

  Implementação (mínimo pragmático)
  - RPC `public.business_kpis_funnel_for_current_empresa()` retorna JSON com:
    - progresso do onboarding (reusa `onboarding_checks_for_current_empresa`)
    - timestamps e tempo até 1ª venda / 1ª NF-e / 1ª movimentação (entrada)

  Segurança
  - Requer `metrics:view` e checa vínculo do usuário com a empresa ativa.

  Reversibilidade
  - Reverter removendo a função.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.business_kpis_funnel_for_current_empresa();
CREATE FUNCTION public.business_kpis_funnel_for_current_empresa()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();
  v_empresa_created_at timestamptz := null;

  v_onboarding jsonb := '{}'::jsonb;
  v_onboarding_ok int := 0;
  v_onboarding_total int := 0;
  v_onboarding_done boolean := false;

  v_first_sale_at timestamptz := null;
  v_first_nfe_at timestamptz := null;
  v_first_payment_at timestamptz := null;

  v_days_to_first_sale int := null;
  v_days_to_first_nfe int := null;
  v_days_to_first_payment int := null;
BEGIN
  PERFORM public.require_permission_for_current_user('metrics','view');

  IF v_empresa IS NULL OR v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = v_empresa AND eu.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_member');
  END IF;

  SELECT e.created_at INTO v_empresa_created_at
  FROM public.empresas e
  WHERE e.id = v_empresa;

  -- Setup (onboarding) — reusa checks já consolidados.
  IF to_regprocedure('public.onboarding_checks_for_current_empresa()') IS NOT NULL THEN
    v_onboarding := public.onboarding_checks_for_current_empresa();
    v_onboarding_ok := COALESCE((v_onboarding #>> '{progress,ok}')::int, 0);
    v_onboarding_total := COALESCE((v_onboarding #>> '{progress,total}')::int, 0);
    v_onboarding_done := (v_onboarding_total > 0 AND v_onboarding_ok >= v_onboarding_total);
  END IF;

  -- 1ª venda
  IF to_regclass('public.vendas_pedidos') IS NOT NULL THEN
    SELECT min(p.created_at)
    INTO v_first_sale_at
    FROM public.vendas_pedidos p
    WHERE p.empresa_id = v_empresa
      AND COALESCE(p.status,'') <> 'cancelado';
  END IF;

  -- 1ª NF-e (considera quando sai do rascunho)
  IF to_regclass('public.fiscal_nfe_emissoes') IS NOT NULL THEN
    SELECT min(n.created_at)
    INTO v_first_nfe_at
    FROM public.fiscal_nfe_emissoes n
    WHERE n.empresa_id = v_empresa
      AND COALESCE(n.status,'rascunho') <> 'rascunho';
  END IF;

  -- 1º pagamento/recebimento (entrada)
  IF to_regclass('public.financeiro_movimentacoes') IS NOT NULL THEN
    SELECT min(m.created_at)
    INTO v_first_payment_at
    FROM public.financeiro_movimentacoes m
    WHERE m.empresa_id = v_empresa
      AND m.tipo_mov = 'entrada';
  END IF;

  IF v_empresa_created_at IS NOT NULL AND v_first_sale_at IS NOT NULL THEN
    v_days_to_first_sale := greatest(0, floor(extract(epoch from (v_first_sale_at - v_empresa_created_at)) / 86400)::int);
  END IF;
  IF v_empresa_created_at IS NOT NULL AND v_first_nfe_at IS NOT NULL THEN
    v_days_to_first_nfe := greatest(0, floor(extract(epoch from (v_first_nfe_at - v_empresa_created_at)) / 86400)::int);
  END IF;
  IF v_empresa_created_at IS NOT NULL AND v_first_payment_at IS NOT NULL THEN
    v_days_to_first_payment := greatest(0, floor(extract(epoch from (v_first_payment_at - v_empresa_created_at)) / 86400)::int);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'empresa_id', v_empresa,
    'empresa_created_at', v_empresa_created_at,
    'setup', jsonb_build_object(
      'ok', v_onboarding_ok,
      'total', v_onboarding_total,
      'done', v_onboarding_done
    ),
    'first_sale', jsonb_build_object(
      'at', v_first_sale_at,
      'days_to_first', v_days_to_first_sale
    ),
    'first_nfe', jsonb_build_object(
      'at', v_first_nfe_at,
      'days_to_first', v_days_to_first_nfe
    ),
    'first_payment', jsonb_build_object(
      'at', v_first_payment_at,
      'days_to_first', v_days_to_first_payment
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_kpis_funnel_for_current_empresa() FROM public;
GRANT EXECUTE ON FUNCTION public.business_kpis_funnel_for_current_empresa() TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

