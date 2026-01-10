-- =============================================================================
-- Serviços > Contratos: vínculo opcional com Serviço + fidelidade (meses)
-- =============================================================================

BEGIN;

-- Colunas (idempotente)
ALTER TABLE public.servicos_contratos
  ADD COLUMN IF NOT EXISTS servico_id uuid,
  ADD COLUMN IF NOT EXISTS fidelidade_meses integer;

-- FK para serviços (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'servicos_contratos_servico_id_fkey'
      AND c.conrelid = 'public.servicos_contratos'::regclass
  ) THEN
    ALTER TABLE public.servicos_contratos
      ADD CONSTRAINT servicos_contratos_servico_id_fkey
      FOREIGN KEY (servico_id)
      REFERENCES public.servicos(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- CHECK fidelidade >= 0 (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'servicos_contratos_fidelidade_meses_check'
      AND c.conrelid = 'public.servicos_contratos'::regclass
  ) THEN
    ALTER TABLE public.servicos_contratos
      ADD CONSTRAINT servicos_contratos_fidelidade_meses_check
      CHECK (fidelidade_meses IS NULL OR fidelidade_meses >= 0);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_servicos_contratos_servico_id ON public.servicos_contratos(servico_id);

COMMIT;

