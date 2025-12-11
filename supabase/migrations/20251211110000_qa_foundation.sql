-- QA Foundation: Status on Lots & Scrap Motives

BEGIN;

-- 1. Add QA Status to Stock Lots
-- Defines the lifecycle of a lot:
-- 'aprovado': Available for use/sale.
-- 'em_analise': Under inspection (blocked).
-- 'bloqueado': Manually blocked (blocked).
-- 'reprovado': Rejected (blocked).

DO $$ BEGIN
    CREATE TYPE public.status_lote_qa AS ENUM ('aprovado', 'em_analise', 'bloqueado', 'reprovado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.estoque_lotes
ADD COLUMN IF NOT EXISTS status_qa public.status_lote_qa DEFAULT 'aprovado' NOT NULL;

-- Index for filtering available stock (only 'aprovado' is usable)
CREATE INDEX IF NOT EXISTS idx_estoque_lotes_status ON public.estoque_lotes(empresa_id, status_qa);


-- 2. Create Quality Motives Table (Scrap/Rejection Reasons)
CREATE TABLE IF NOT EXISTS public.industria_qualidade_motivos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    codigo text NOT NULL,
    descricao text NOT NULL,
    tipo text DEFAULT 'refugo', -- 'refugo', 'bloqueio', 'devolucao'
    ativo boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, codigo)
);

ALTER TABLE public.industria_qualidade_motivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.industria_qualidade_motivos
    FOR SELECT USING (empresa_id = public.current_empresa_id());

CREATE POLICY "Enable all access for authenticated users" ON public.industria_qualidade_motivos
    FOR ALL USING (empresa_id = public.current_empresa_id());

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at_qualidade_motivos
BEFORE UPDATE ON public.industria_qualidade_motivos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- 3. RPC: Get Motives
DROP FUNCTION IF EXISTS public.qualidade_get_motivos();

CREATE OR REPLACE FUNCTION public.qualidade_get_motivos()
RETURNS TABLE (
    id uuid,
    codigo text,
    descricao text,
    tipo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.codigo, m.descricao, m.tipo
    FROM public.industria_qualidade_motivos m
    WHERE m.empresa_id = public.current_empresa_id()
    AND m.ativo = true
    ORDER BY m.codigo;
END;
$$;


-- 4. RPC: Alter Lot Status (Block/Unblock)
CREATE OR REPLACE FUNCTION public.qualidade_alterar_status_lote(
    p_lote_id uuid, -- ID of the record in estoque_lotes
    p_novo_status public.status_lote_qa,
    p_observacoes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_lote_record record;
BEGIN
    -- Verify ownership
    SELECT * INTO v_lote_record
    FROM public.estoque_lotes
    WHERE id = p_lote_id AND empresa_id = public.current_empresa_id();

    IF v_lote_record IS NULL THEN
        RAISE EXCEPTION 'Lote não encontrado ou acesso negado.';
    END IF;

    -- Update status
    UPDATE public.estoque_lotes
    SET status_qa = p_novo_status,
        updated_at = now()
    WHERE id = p_lote_id;

    -- Log event (if audit table exists, or could add specific qa log table later)
    -- For now, we trust the update. In Phase 1.5 we add 'industria_qualidade_historico'.
    
    -- NOTE: Ideally, if status changes to blocked, we should check if it's reserved
    -- and potentially warn or flag, but for now we enforce blocking on *future* actions.
END;
$$;


-- 5. Seed Initial Motives (Removed to avoid current_empresa_id() issues during migration)
-- Please register motives manually via the application.

COMMIT;
