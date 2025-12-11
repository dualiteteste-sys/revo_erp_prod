
-- 1. Enum for Traceability
DO $$ BEGIN
    CREATE TYPE public.tipo_rastreabilidade AS ENUM ('nenhum', 'lote', 'serial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter Produtos to support Traceability
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS rastreabilidade public.tipo_rastreabilidade DEFAULT 'nenhum';

-- Migrate existing 'controlar_lotes' flag to new enum
UPDATE public.produtos 
SET rastreabilidade = 'lote' 
WHERE controlar_lotes = true AND rastreabilidade = 'nenhum';

-- 3. Create Estoque Lotes (Stock Lots Balance)
CREATE TABLE IF NOT EXISTS public.estoque_lotes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
    lote text NOT NULL,
    validade date,
    saldo numeric(15,4) DEFAULT 0 NOT NULL,
    custo_medio numeric(15,4) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, produto_id, lote)
);

ALTER TABLE public.estoque_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.estoque_lotes;
CREATE POLICY "Enable read access for all users" ON public.estoque_lotes
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.estoque_lotes;
CREATE POLICY "Enable insert for authenticated users only" ON public.estoque_lotes
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.estoque_lotes;
CREATE POLICY "Enable update for authenticated users only" ON public.estoque_lotes
    FOR UPDATE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.estoque_lotes;
CREATE POLICY "Enable delete for authenticated users only" ON public.estoque_lotes
    FOR DELETE USING (empresa_id = public.current_empresa_id());

-- 4. Alter Estoque Movimentos to support Lot/Serial
ALTER TABLE public.estoque_movimentos
ADD COLUMN IF NOT EXISTS lote text,
ADD COLUMN IF NOT EXISTS seriais jsonb;

-- Index for performance on lot movements
CREATE INDEX IF NOT EXISTS idx_estoque_movimentos_lote ON public.estoque_movimentos(empresa_id, produto_id, lote);

-- 5. Create Industria Reservas (Allocations)
CREATE TABLE IF NOT EXISTS public.industria_reservas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE NOT NULL,
    componente_id uuid REFERENCES public.industria_producao_componentes(id) ON DELETE CASCADE,
    lote text,
    quantidade numeric(15,4) NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, ordem_id, componente_id, lote) -- Prevent duplicate rows for same lot allocation
);

ALTER TABLE public.industria_reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.industria_reservas;
CREATE POLICY "Enable read access for all users" ON public.industria_reservas
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.industria_reservas;
CREATE POLICY "Enable insert for authenticated users only" ON public.industria_reservas
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.industria_reservas;
CREATE POLICY "Enable update for authenticated users only" ON public.industria_reservas
    FOR UPDATE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.industria_reservas;
CREATE POLICY "Enable delete for authenticated users only" ON public.industria_reservas
    FOR DELETE USING (empresa_id = public.current_empresa_id());

-- 6. Alter Industria Producao Componentes to track reserved quantity
ALTER TABLE public.industria_producao_componentes
ADD COLUMN IF NOT EXISTS quantidade_reservada numeric(15,4) DEFAULT 0;

-- Trigger to update updated_at on new tables
-- Trigger to update updated_at on new tables
DROP TRIGGER IF EXISTS handle_updated_at_estoque_lotes ON public.estoque_lotes;
CREATE TRIGGER handle_updated_at_estoque_lotes 
BEFORE UPDATE ON public.estoque_lotes 
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_industria_reservas ON public.industria_reservas;
CREATE TRIGGER handle_updated_at_industria_reservas 
BEFORE UPDATE ON public.industria_reservas 
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
