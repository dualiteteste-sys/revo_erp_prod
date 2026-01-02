/*
  SEC-RBAC-01: Matriz de permissões revisada (inclui export)

  Objetivo:
  - Permitir action `export` no schema de RBAC (DB) para enforcement consistente.
  - Sem alterar a lógica de grants existente além do necessário (idempotente).
*/

BEGIN;

-- 1) Permitir 'export' na constraint de ações
DO $$
BEGIN
  IF to_regclass('public.permissions') IS NULL THEN
    RETURN;
  END IF;

  -- Drop constraints antigas se existirem (histórico: permissions_action_chk e/ou ck_action)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'permissions'
      AND c.conname IN ('permissions_action_chk','ck_action')
  ) THEN
    EXECUTE 'ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_action_chk';
    EXECUTE 'ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS ck_action';
  END IF;

  -- Recria com 'export' e mantém compatibilidade com ações custom existentes (ex.: 'discount')
  EXECUTE $sql$
    ALTER TABLE public.permissions
    ADD CONSTRAINT permissions_action_chk
    CHECK (action in ('view','create','update','delete','manage','discount','export')) NOT VALID
  $sql$;

  EXECUTE 'ALTER TABLE public.permissions VALIDATE CONSTRAINT permissions_action_chk';
END $$;

-- 2) Criar permissões export para módulos existentes (onde faz sentido)
DO $$
DECLARE
  m text;
BEGIN
  IF to_regclass('public.permissions') IS NULL THEN
    RETURN;
  END IF;

  FOR m IN
    SELECT DISTINCT module
    FROM public.permissions
    WHERE module IS NOT NULL AND module <> ''
  LOOP
    INSERT INTO public.permissions(module, action)
    VALUES (m, 'export')
    ON CONFLICT (module, action) DO NOTHING;
  END LOOP;
END $$;

COMMIT;
