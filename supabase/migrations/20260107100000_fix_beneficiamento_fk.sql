/*
  # Fix Foreign Key for Beneficiamento Orders
  
  The table `industria_benef_ordens` had a foreign key constraint `ind_benef_ordens_prod_serv_fkey` 
  pointing to the `produtos` table for the `produto_servico_id` column. 
  
  However, the application logic uses the `servicos` module for this field.
  
  This migration:
  1. Drops the incorrect constraint referencing `produtos`.
  2. Adds a new constraint `ind_benef_ordens_servico_fkey` referencing `servicos`.
*/

DO $$
BEGIN
    -- 1. Drop the incorrect FK if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ind_benef_ordens_prod_serv_fkey' 
        AND conrelid = 'public.industria_benef_ordens'::regclass
    ) THEN
        ALTER TABLE public.industria_benef_ordens 
        DROP CONSTRAINT ind_benef_ordens_prod_serv_fkey;
    END IF;

    -- 2. Add the correct FK to servicos
    -- We verify servicos table exists first to be safe
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'servicos') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'ind_benef_ordens_servico_fkey'
            AND conrelid = 'public.industria_benef_ordens'::regclass
        ) THEN
            ALTER TABLE public.industria_benef_ordens 
            ADD CONSTRAINT ind_benef_ordens_servico_fkey 
            FOREIGN KEY (produto_servico_id) 
            REFERENCES public.servicos(id);
        END IF;
    END IF;
END $$;
