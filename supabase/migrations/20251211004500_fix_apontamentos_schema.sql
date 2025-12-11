-- Fix missing column 'tipo' in industria_producao_apontamentos

BEGIN;

-- Ensure the column exists
ALTER TABLE public.industria_producao_apontamentos 
ADD COLUMN IF NOT EXISTS tipo text;

-- Drop old constraint if it exists (to ensure we have the correct one)
ALTER TABLE public.industria_producao_apontamentos 
DROP CONSTRAINT IF EXISTS industria_producao_apontamentos_tipo_check;

-- Add constraint matching our logic
ALTER TABLE public.industria_producao_apontamentos 
ADD CONSTRAINT industria_producao_apontamentos_tipo_check 
CHECK (tipo IN ('producao', 'setup', 'parada', 'retorno', 'conclusao'));

COMMIT;
