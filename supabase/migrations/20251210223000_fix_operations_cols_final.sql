-- Final Fix for Operations Schema Mismatch
-- Exhaustively checking and adding all required columns

BEGIN;

DO $$
BEGIN
    -- 1. Ensure 'industria_producao_operacoes' has all columns
    
    -- tempo_planejado_minutos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'tempo_planejado_minutos') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN tempo_planejado_minutos numeric DEFAULT 0;
    END IF;

    -- tempo_real_minutos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'tempo_real_minutos') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN tempo_real_minutos numeric DEFAULT 0;
    END IF;

    -- quantidade_planejada
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'quantidade_planejada') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN quantidade_planejada numeric DEFAULT 0;
    END IF;

    -- quantidade_realizada
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'quantidade_realizada') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN quantidade_realizada numeric DEFAULT 0;
    END IF;

    -- quantidade_refugo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'quantidade_refugo') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN quantidade_refugo numeric DEFAULT 0;
    END IF;

    -- centro_trabalho_nome (denormalized)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'centro_trabalho_nome') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN centro_trabalho_nome text;
    END IF;
    
    -- centro_trabalho_id (FK)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'centro_trabalho_id') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN centro_trabalho_id uuid REFERENCES public.industria_centros_trabalho(id);
    END IF;

    -- sequencia
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'sequencia') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN sequencia integer DEFAULT 0;
    END IF;
    
    -- status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'status') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN status text DEFAULT 'pendente';
    END IF;

END $$;

COMMIT;
