-- =============================================
-- Migration: ind_faturamento_v2_schema
-- Redesign do faturamento de OB (Beneficiamento):
--   - OB deixa de criar Pedido/NF-e diretamente
--   - Novo modelo: entregas elegíveis → composição fiscal → NF-e draft
--   - Junction table para rastreabilidade N:M (entregas ↔ NF-e)
-- =============================================

-- ─────────────────────────────────────────────
-- 1) Junction table: industria_faturamento_entregas
--    Liga entregas de OB a NF-e emitidas
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.industria_faturamento_entregas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL
                      REFERENCES public.empresas(id) ON DELETE CASCADE,
  emissao_id          uuid NOT NULL
                      REFERENCES public.fiscal_nfe_emissoes(id) ON DELETE CASCADE,
  entrega_id          uuid NOT NULL
                      REFERENCES public.industria_ordens_entregas(id) ON DELETE RESTRICT,
  ordem_id            uuid NOT NULL
                      REFERENCES public.industria_ordens(id) ON DELETE RESTRICT,
  quantidade_faturada numeric(15,4) NOT NULL CHECK (quantidade_faturada > 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique: uma entrega só pode ser linkada uma vez por NF-e
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ux_ind_fat_entregas_emissao_entrega'
  ) THEN
    ALTER TABLE public.industria_faturamento_entregas
      ADD CONSTRAINT ux_ind_fat_entregas_emissao_entrega
      UNIQUE (emissao_id, entrega_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ind_fat_entregas_empresa
  ON public.industria_faturamento_entregas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_ind_fat_entregas_emissao
  ON public.industria_faturamento_entregas (emissao_id);
CREATE INDEX IF NOT EXISTS idx_ind_fat_entregas_entrega
  ON public.industria_faturamento_entregas (entrega_id);
CREATE INDEX IF NOT EXISTS idx_ind_fat_entregas_ordem
  ON public.industria_faturamento_entregas (ordem_id);

-- ─────────────────────────────────────────────
-- 2) RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.industria_faturamento_entregas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ind_fat_entregas_select' AND tablename = 'industria_faturamento_entregas') THEN
    CREATE POLICY ind_fat_entregas_select ON public.industria_faturamento_entregas
      FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ind_fat_entregas_insert' AND tablename = 'industria_faturamento_entregas') THEN
    CREATE POLICY ind_fat_entregas_insert ON public.industria_faturamento_entregas
      FOR INSERT TO authenticated WITH CHECK (empresa_id = public.current_empresa_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ind_fat_entregas_update' AND tablename = 'industria_faturamento_entregas') THEN
    CREATE POLICY ind_fat_entregas_update ON public.industria_faturamento_entregas
      FOR UPDATE TO authenticated USING (empresa_id = public.current_empresa_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ind_fat_entregas_delete' AND tablename = 'industria_faturamento_entregas') THEN
    CREATE POLICY ind_fat_entregas_delete ON public.industria_faturamento_entregas
      FOR DELETE TO authenticated USING (empresa_id = public.current_empresa_id());
  END IF;
END $$;

-- service_role bypass
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ind_fat_entregas_srv' AND tablename = 'industria_faturamento_entregas') THEN
    CREATE POLICY ind_fat_entregas_srv ON public.industria_faturamento_entregas
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.industria_faturamento_entregas TO authenticated;
GRANT ALL ON public.industria_faturamento_entregas TO service_role;

SELECT pg_notify('pgrst','reload schema');
