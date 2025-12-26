/*
  Infra: força reload do schema no PostgREST

  Motivo:
  - Evitar erros 404 (schema cache) após criação/alteração de RPCs e views.
  - Mantém a DX/CI mais estável, principalmente após pushes seguidos de migrations.
*/

BEGIN;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

