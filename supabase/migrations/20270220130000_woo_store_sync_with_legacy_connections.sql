/*
  WOO-OPS-02: Sincronizar stores Woo (novo módulo) com conexões legadas (Configurações → Marketplaces)

  Problema observado em produção:
  - Tela de Configurações (ecommerces + ecommerce_connection_secrets) mostra "Conectado" + credenciais armazenadas,
    mas o Painel Dev Woo/Worker (integrations_woocommerce_store) fica "paused" ou com credenciais divergentes.
  - Resultado: runs ficam QUEUED e o worker não drena fila por store pausada / auth_mode incompatível.

  Estratégia:
  - Introduzir metadados no store para rastrear a origem legada (ecommerce_id) e o último updated_at dos segredos legados.
  - Permitir que a Edge Function woocommerce-admin faça "sync idempotente" das credenciais criptografadas quando os segredos legados mudarem,
    sem sobrescrever alterações manuais desnecessariamente.

  Segurança:
  - Não armazena chaves em plaintext no banco; apenas metadados (ids/timestamps).
  - A criptografia continua sendo feita nas Edge Functions com INTEGRATIONS_MASTER_KEY.
*/

BEGIN;

ALTER TABLE IF EXISTS public.integrations_woocommerce_store
  ADD COLUMN IF NOT EXISTS legacy_ecommerce_id uuid NULL,
  ADD COLUMN IF NOT EXISTS legacy_secrets_updated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_integrations_woocommerce_store_legacy
  ON public.integrations_woocommerce_store (legacy_ecommerce_id);

COMMIT;

