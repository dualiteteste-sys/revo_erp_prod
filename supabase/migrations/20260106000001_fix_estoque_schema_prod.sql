/*
  # Fix Estoque Schema (Production)
  
  ## Description
  Adds missing columns to 'estoque_movimentos' and relaxes NOT NULL constraints on balance columns
  to support the XML import flow where previous balance might not be available.
  
  ## Changes
  - Add columns: valor_unitario, origem_tipo, origem_id, observacoes, updated_at, created_at, tipo_mov.
  - Drop NOT NULL: saldo_anterior, saldo_novo.
*/

DO $$
BEGIN
    -- 1. Add valor_unitario (Numeric for unit price)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'valor_unitario') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN valor_unitario numeric(18,6);
    END IF;

    -- 2. Add origem_tipo (Text to identify source, e.g., 'nfe_beneficiamento')
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'origem_tipo') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN origem_tipo text DEFAULT 'manual';
    END IF;

    -- 3. Add origem_id (UUID to link to the source record)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'origem_id') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN origem_id uuid;
    END IF;

    -- 4. Add observacoes (Text for notes)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'observacoes') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN observacoes text;
    END IF;

    -- 5. Add updated_at (Timestamptz)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'updated_at') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;

    -- 6. Add created_at (Timestamptz)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'created_at') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN created_at timestamptz DEFAULT now();
    END IF;
    
    -- 7. Add tipo_mov (Text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'tipo_mov') THEN
        ALTER TABLE public.estoque_movimentos ADD COLUMN tipo_mov text DEFAULT 'entrada_beneficiamento';
    END IF;

    -- 8. Make saldo_anterior nullable if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'saldo_anterior') THEN
        ALTER TABLE public.estoque_movimentos ALTER COLUMN saldo_anterior DROP NOT NULL;
    END IF;

    -- 9. Make saldo_novo nullable if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estoque_movimentos' AND column_name = 'saldo_novo') THEN
        ALTER TABLE public.estoque_movimentos ALTER COLUMN saldo_novo DROP NOT NULL;
    END IF;

END $$;
