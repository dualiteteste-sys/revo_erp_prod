/*
  Sprint 4 (P0): Disconnect WooCommerce deve limpar store runtime

  Problema
  - "Desconectar" no módulo de Integrações limpa secrets em `ecommerce_connection_secrets`,
    mas a integração Woo runtime (worker/painel dev) usa `integrations_woocommerce_store`.
  - Resultado: store antiga ainda aparece em selects/painéis, podendo ficar "ativa/credenciada"
    mesmo depois de desconectar no fluxo principal.

  Solução
  - Estender `public.ecommerce_connections_disconnect(p_id)` para, quando provider='woo':
    - pausar stores vinculadas via `legacy_ecommerce_id`
    - remover secrets criptografados (consumer_key_enc/consumer_secret_enc)
    - "matar" jobs Woo pendentes/rodando com status=dead para parar processamento

  Segurança
  - Não retorna nem loga segredos.
  - Mantém o mesmo contrato da função (RETURNS void).
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.ecommerce_connections_disconnect(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();
  v_provider text;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  SELECT e.provider
  INTO v_provider
  FROM public.ecommerces e
  WHERE e.id = p_id
    AND e.empresa_id = v_empresa
  LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Conexão não encontrada' USING errcode = 'P0002';
  END IF;

  UPDATE public.ecommerces
  SET
    status = 'disconnected',
    external_account_id = NULL,
    connected_at = NULL,
    last_sync_at = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_id
    AND empresa_id = v_empresa;

  DELETE FROM public.ecommerce_connection_secrets
  WHERE ecommerce_id = p_id
    AND empresa_id = v_empresa;

  -- Woo: limpar runtime store (worker/painel dev) para evitar drift pós-disconnect.
  IF v_provider = 'woo' THEN
    IF to_regclass('public.integrations_woocommerce_store') IS NOT NULL THEN
      UPDATE public.integrations_woocommerce_store s
      SET
        status = 'paused',
        consumer_key_enc = NULL,
        consumer_secret_enc = NULL,
        legacy_secrets_updated_at = NULL,
        updated_at = now()
      WHERE s.empresa_id = v_empresa
        AND s.legacy_ecommerce_id = p_id;
    END IF;

    IF to_regclass('public.woocommerce_sync_job') IS NOT NULL THEN
      UPDATE public.woocommerce_sync_job j
      SET
        status = 'dead',
        last_error = 'STORE_DISCONNECTED',
        locked_at = NULL,
        lock_owner = NULL,
        updated_at = now()
      WHERE j.empresa_id = v_empresa
        AND j.status IN ('queued','running','error')
        AND j.store_id IN (
          SELECT s.id
          FROM public.integrations_woocommerce_store s
          WHERE s.empresa_id = v_empresa
            AND s.legacy_ecommerce_id = p_id
        );
    END IF;
  END IF;

  -- Cancela pendências da conexão (evita continuar processando sem token).
  IF to_regclass('public.ecommerce_jobs') IS NOT NULL THEN
    DELETE FROM public.ecommerce_jobs
    WHERE empresa_id = v_empresa
      AND ecommerce_id = p_id
      AND status IN ('pending','processing','error');
  END IF;

  -- Log estruturado para trilha operacional (sem tokens).
  IF to_regclass('public.ecommerce_logs') IS NOT NULL THEN
    INSERT INTO public.ecommerce_logs (
      empresa_id, ecommerce_id, provider, level, event, message, context, created_at
    ) VALUES (
      v_empresa,
      p_id,
      v_provider,
      'info',
      'disconnect',
      'Conexão desconectada e secrets removidos.',
      jsonb_build_object('user_id', v_uid),
      now()
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_connections_disconnect(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_connections_disconnect(uuid) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

