-- Fix Operations RPC and Table Mismatch

BEGIN;

-- 1. Ensure the Correct Table Exists (industria_producao_operacoes)
-- Note: User mentioned 'industria_operacoes' which might be an old table. We stick to our naming convention.
CREATE TABLE IF NOT EXISTS public.industria_producao_operacoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id(),
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE,
    sequencia integer NOT NULL,
    centro_trabalho_id uuid REFERENCES public.industria_centros_trabalho(id),
    centro_trabalho_nome text, 
    descricao text NOT NULL, -- This is the missing column in the other table
    tempo_planejado_minutos numeric DEFAULT 0,
    tempo_real_minutos numeric DEFAULT 0,
    quantidade_planejada numeric DEFAULT 0,
    quantidade_realizada numeric DEFAULT 0,
    quantidade_refugo numeric DEFAULT 0,
    status text DEFAULT 'pendente',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.industria_producao_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por empresa" ON public.industria_producao_operacoes;
CREATE POLICY "Acesso por empresa" ON public.industria_producao_operacoes USING (empresa_id = public.current_empresa_id());

-- 2. Force Replace the RPC to point to the CORRECT table
CREATE OR REPLACE FUNCTION public.industria_producao_get_operacoes(p_ordem_id uuid)
RETURNS TABLE (
    id uuid,
    ordem_id uuid,
    sequencia integer,
    centro_trabalho_id uuid,
    centro_trabalho_nome text,
    descricao text,
    tempo_planejado_minutos numeric,
    tempo_real_minutos numeric,
    quantidade_planejada numeric,
    quantidade_realizada numeric,
    quantidade_refugo numeric,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id, o.ordem_id, o.sequencia, 
        o.centro_trabalho_id, o.centro_trabalho_nome, 
        o.descricao, 
        o.tempo_planejado_minutos, o.tempo_real_minutos,
        o.quantidade_planejada, o.quantidade_realizada, o.quantidade_refugo,
        o.status
    FROM public.industria_producao_operacoes o -- Explicitly use the table with _producao_
    WHERE o.ordem_id = p_ordem_id AND o.empresa_id = public.current_empresa_id()
    ORDER BY o.sequencia ASC;
END;
$$;

COMMIT;
