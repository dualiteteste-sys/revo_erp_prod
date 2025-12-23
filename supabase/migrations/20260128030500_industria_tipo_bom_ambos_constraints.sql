-- =============================================================================
-- Ajuste de constraints e defaults para tipo_bom aceitar 'ambos' sem duplicar
-- =============================================================================
BEGIN;

-- Ajustar check constraints explicitamente (se existirem) para tipo_bom
DO $$
DECLARE
  v_name text;
BEGIN
  -- industria_roteiros.tipo_bom
  FOR v_name IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' AND t.relname = 'industria_roteiros' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%tipo_bom%'
  LOOP
    EXECUTE 'ALTER TABLE public.industria_roteiros DROP CONSTRAINT ' || quote_ident(v_name);
  END LOOP;

  -- industria_boms.tipo_bom
  FOR v_name IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' AND t.relname = 'industria_boms' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%tipo_bom%'
  LOOP
    EXECUTE 'ALTER TABLE public.industria_boms DROP CONSTRAINT ' || quote_ident(v_name);
  END LOOP;
END $$;

ALTER TABLE public.industria_roteiros
  ADD CONSTRAINT industria_roteiros_tipo_bom_check CHECK (tipo_bom in ('producao', 'beneficiamento', 'ambos'));

ALTER TABLE public.industria_boms
  ADD CONSTRAINT industria_boms_tipo_bom_check CHECK (tipo_bom in ('producao', 'beneficiamento', 'ambos'));

COMMIT;
