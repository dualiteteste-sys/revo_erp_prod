/*
  SEC-INT-03 (P1) Scopes mínimos por integração (OAuth) e auditoria de acessos

  Motivo:
  - Precisamos registrar os "scopes/capacidades" retornados pelo provedor OAuth
    para auditoria e diagnóstico (sem depender de UI/console).

  Impacto:
  - Apenas adiciona colunas opcionais em `public.ecommerce_connection_secrets`.

  Reversibilidade:
  - Seguro: remover colunas (se necessário) sem afetar fluxo principal.
*/

BEGIN;

alter table public.ecommerce_connection_secrets
  add column if not exists token_scopes text null,
  add column if not exists token_type text null;

COMMIT;

