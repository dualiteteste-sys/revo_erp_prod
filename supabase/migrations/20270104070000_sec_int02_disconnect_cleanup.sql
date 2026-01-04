/*
  SEC-INT-02 (P0): Revogação (disconnect) consistente + limpeza de secrets

  Objetivo
  - Garantir que "Desconectar" remova secrets e também limpe pendências que poderiam
    continuar processando com estado inválido.

  O que muda
  - Reforça `public.ecommerce_connections_disconnect(p_id)` para:
    - validar que a conexão existe na empresa ativa
    - limpar `ecommerce_connection_secrets`
    - limpar jobs pendentes/processando vinculados à conexão
    - registrar log estruturado em `public.ecommerce_logs`

  Reversibilidade
  - Reverter para a versão anterior da função em migrations anteriores.
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

