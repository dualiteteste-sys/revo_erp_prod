-- =============================================================================
-- Indústria: garantir 1 OB por item da NF-e (origem)
-- =============================================================================
BEGIN;

-- Evita duplicidade acidental de ordens para o mesmo item fiscal.
CREATE UNIQUE INDEX IF NOT EXISTS ux_industria_ordens_origem_item
  ON public.industria_ordens (empresa_id, origem_fiscal_nfe_item_id)
  WHERE origem_fiscal_nfe_item_id IS NOT NULL;

COMMIT;

