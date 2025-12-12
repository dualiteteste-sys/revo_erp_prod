-- =============================================================================
-- Histórico de ações MRP (armazenar usuário e expor RPC)
-- =============================================================================

BEGIN;

ALTER TABLE public.industria_mrp_demanda_acoes
    ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.mrp_registrar_acao_demanda(
    p_demanda_id uuid,
    p_tipo text DEFAULT 'manual',
    p_quantidade numeric DEFAULT 0,
    p_unidade text DEFAULT NULL,
    p_data_prometida date DEFAULT NULL,
    p_fornecedor_id uuid DEFAULT NULL,
    p_observacoes text DEFAULT NULL,
    p_status text DEFAULT 'respondida'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_demanda record;
    v_id uuid;
    v_tipo text := COALESCE(p_tipo, 'manual');
BEGIN
    SELECT *
      INTO v_demanda
      FROM public.industria_mrp_demandas
     WHERE id = p_demanda_id
       AND empresa_id = public.current_empresa_id();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demanda não encontrada.';
    END IF;

    INSERT INTO public.industria_mrp_demanda_acoes (
        empresa_id,
        demanda_id,
        tipo,
        quantidade,
        unidade,
        fornecedor_id,
        data_prometida,
        observacoes,
        detalhes,
        usuario_id
    ) VALUES (
        v_demanda.empresa_id,
        v_demanda.id,
        v_tipo,
        GREATEST(COALESCE(p_quantidade, 0), 0),
        COALESCE(p_unidade, 'un'),
        p_fornecedor_id,
        p_data_prometida,
        p_observacoes,
        jsonb_build_object(
            'necessidade_liquida', v_demanda.necessidade_liquida,
            'origem', v_demanda.origem
        ),
        auth.uid()
    ) RETURNING id INTO v_id;

    UPDATE public.industria_mrp_demandas
       SET status = COALESCE(p_status, 'respondida'),
           updated_at = now()
     WHERE id = v_demanda.id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mrp_list_demanda_acoes(p_demanda_id uuid)
RETURNS TABLE (
    id uuid,
    tipo text,
    quantidade numeric,
    unidade text,
    data_prometida date,
    observacoes text,
    created_at timestamptz,
    usuario_id uuid,
    usuario_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        a.id,
        a.tipo,
        a.quantidade,
        a.unidade,
        a.data_prometida,
        a.observacoes,
        a.created_at,
        a.usuario_id,
        u.email AS usuario_email
    FROM public.industria_mrp_demanda_acoes a
    LEFT JOIN auth.users u ON u.id = a.usuario_id
    WHERE a.demanda_id = p_demanda_id
      AND a.empresa_id = public.current_empresa_id()
    ORDER BY a.created_at DESC;
$$;

COMMIT;
