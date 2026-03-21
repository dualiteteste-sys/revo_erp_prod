-- ============================================================
-- PDV NFC-e Foundation
-- ============================================================
-- Adds all DB schema required for NFC-e (modelo 65) emission
-- from PDV and multi-payment support.
--
-- Changes:
--   1A. fiscal_nfe_emissoes.modelo ('55' | '65')
--   1B. fiscal_nfe_emitente: csc, id_csc, nfce_serie, nfce_proximo_numero
--   1C. vendas_pdv_pagamentos table (multi-payment per sale)
--   1D. vendas_pedidos.nfce_emissao_id (link to NFC-e emission)
-- ============================================================

BEGIN;

-- ─── 1A. Coluna modelo em fiscal_nfe_emissoes ───────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fiscal_nfe_emissoes'
      AND column_name = 'modelo'
  ) THEN
    ALTER TABLE public.fiscal_nfe_emissoes
      ADD COLUMN modelo text NOT NULL DEFAULT '55';

    ALTER TABLE public.fiscal_nfe_emissoes
      ADD CONSTRAINT ck_fiscal_nfe_emissoes_modelo
        CHECK (modelo IN ('55', '65'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fiscal_nfe_emissoes_modelo
  ON public.fiscal_nfe_emissoes (empresa_id, modelo, status);

-- ─── 1B. Colunas NFC-e em fiscal_nfe_emitente ───────────────

ALTER TABLE public.fiscal_nfe_emitente
  ADD COLUMN IF NOT EXISTS csc text NULL,
  ADD COLUMN IF NOT EXISTS id_csc text NULL,
  ADD COLUMN IF NOT EXISTS nfce_serie integer NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfce_proximo_numero integer NULL DEFAULT 1;

-- ─── 1C. Tabela vendas_pdv_pagamentos ────────────────────────

CREATE TABLE IF NOT EXISTS public.vendas_pdv_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id()
    REFERENCES public.empresas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL
    REFERENCES public.vendas_pedidos(id) ON DELETE CASCADE,
  forma_pagamento text NOT NULL,
  forma_pagamento_sefaz text NOT NULL DEFAULT '99',
  valor numeric(15,2) NOT NULL,
  valor_recebido numeric(15,2) NULL,
  troco numeric(15,2) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_pdv_pagamentos_pedido
  ON public.vendas_pdv_pagamentos (empresa_id, pedido_id);

ALTER TABLE public.vendas_pdv_pagamentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendas_pdv_pagamentos'
      AND policyname = 'vendas_pdv_pagamentos_tenant_select'
  ) THEN
    CREATE POLICY vendas_pdv_pagamentos_tenant_select
      ON public.vendas_pdv_pagamentos FOR SELECT TO authenticated
      USING (empresa_id = public.current_empresa_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendas_pdv_pagamentos'
      AND policyname = 'vendas_pdv_pagamentos_tenant_write'
  ) THEN
    CREATE POLICY vendas_pdv_pagamentos_tenant_write
      ON public.vendas_pdv_pagamentos FOR ALL TO authenticated
      USING (empresa_id = public.current_empresa_id())
      WITH CHECK (empresa_id = public.current_empresa_id());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.vendas_pdv_pagamentos TO authenticated, service_role;

-- ─── 1D. Coluna nfce_emissao_id em vendas_pedidos ───────────

ALTER TABLE public.vendas_pedidos
  ADD COLUMN IF NOT EXISTS nfce_emissao_id uuid NULL
    REFERENCES public.fiscal_nfe_emissoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_pedidos_nfce_emissao
  ON public.vendas_pedidos (empresa_id, nfce_emissao_id)
  WHERE nfce_emissao_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
