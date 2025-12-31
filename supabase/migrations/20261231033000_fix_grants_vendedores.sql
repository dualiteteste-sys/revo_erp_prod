/*
  COM-01: Comissões / Vendedores (UI usa REST direto)
  - Garantir GRANTs para authenticated no CRUD de public.vendedores
*/

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendedores TO authenticated, service_role;

COMMIT;

