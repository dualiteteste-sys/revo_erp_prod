BEGIN;

-- Fix Foreign Key Constraint on Apontamentos
-- The previous migration accidentally created a reference to the wrong table name 'qualidade_motivos_refugo'.
-- We need to point it to the correct table 'industria_qualidade_motivos'.

-- 1. Drop existing incorrect constraint
ALTER TABLE public.industria_producao_apontamentos
DROP CONSTRAINT IF EXISTS industria_producao_apontamentos_motivo_refugo_id_fkey;

-- 2. Add correct constraint
ALTER TABLE public.industria_producao_apontamentos
ADD CONSTRAINT industria_producao_apontamentos_motivo_refugo_id_fkey
FOREIGN KEY (motivo_refugo_id)
REFERENCES public.industria_qualidade_motivos(id)
ON DELETE SET NULL;

-- 3. Drop obsolete table if it exists (to avoid confusion)
DROP TABLE IF EXISTS public.qualidade_motivos_refugo CASCADE;

COMMIT;
