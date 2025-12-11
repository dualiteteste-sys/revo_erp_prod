-- =============================================================================
-- Add apontamento listing/deletion and prevent overproduction
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_list_apontamentos(p_operacao_id uuid)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    quantidade_boa numeric,
    quantidade_refugo numeric,
    motivo_refugo text,
    observacoes text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        a.id,
        a.created_at,
        COALESCE(a.quantidade_boa, 0) AS quantidade_boa,
        COALESCE(a.quantidade_refugo, 0) AS quantidade_refugo,
        a.motivo_refugo,
        a.observacoes
    FROM public.industria_producao_apontamentos a
    WHERE a.operacao_id = p_operacao_id
      AND a.empresa_id = public.current_empresa_id()
    ORDER BY a.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.industria_producao_delete_apontamento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_operacao_id uuid;
    v_empresa_id uuid;
    v_boa numeric;
    v_refugo numeric;
BEGIN
    SELECT operacao_id, empresa_id,
           COALESCE(quantidade_boa, 0),
           COALESCE(quantidade_refugo, 0)
      INTO v_operacao_id, v_empresa_id, v_boa, v_refugo
      FROM public.industria_producao_apontamentos
     WHERE id = p_id;

    IF v_operacao_id IS NULL THEN
        RAISE EXCEPTION 'Apontamento não encontrado.';
    END IF;
    IF v_empresa_id IS DISTINCT FROM public.current_empresa_id() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    DELETE FROM public.industria_producao_apontamentos
     WHERE id = p_id;

    UPDATE public.industria_producao_operacoes
       SET quantidade_produzida = GREATEST(0, quantidade_produzida - v_boa),
           quantidade_realizada = GREATEST(0, quantidade_realizada - v_boa),
           quantidade_refugo    = GREATEST(0, quantidade_refugo - v_refugo),
           updated_at = now()
     WHERE id = v_operacao_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.industria_producao_apontar_producao(
    p_operacao_id uuid,
    p_quantidade_produzida numeric,
    p_quantidade_refugo numeric,
    p_motivo_refugo text,
    p_observacoes text,
    p_finalizar boolean,
    p_motivo_refugo_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ordem_id uuid;
    v_empresa_id uuid;
    v_usuario_id uuid := auth.uid();
    v_motivo_id uuid := NULL;
    v_has_industria boolean := to_regclass('public.industria_qualidade_motivos') IS NOT NULL;
    v_has_legacy boolean := to_regclass('public.qualidade_motivos_refugo') IS NOT NULL;
    v_planejada numeric;
    v_total_produzido numeric;
    v_total_refugo numeric;
BEGIN
    SELECT o.ordem_id, o.empresa_id, o.quantidade_planejada,
           COALESCE(o.quantidade_produzida, 0),
           COALESCE(o.quantidade_refugo, 0)
      INTO v_ordem_id, v_empresa_id, v_planejada, v_total_produzido, v_total_refugo
      FROM public.industria_producao_operacoes o
     WHERE o.id = p_operacao_id;

    IF v_ordem_id IS NULL THEN
        RAISE EXCEPTION 'Operação não encontrada.';
    END IF;

    IF v_empresa_id IS DISTINCT FROM public.current_empresa_id() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    IF (v_total_produzido + v_total_refugo + p_quantidade_produzida + p_quantidade_refugo) > v_planejada THEN
        RAISE EXCEPTION 'Quantidade informada excede o planejado da operação.';
    END IF;

    IF p_motivo_refugo_id IS NOT NULL THEN
        IF v_has_industria THEN
            SELECT id
              INTO v_motivo_id
              FROM public.industria_qualidade_motivos
             WHERE id = p_motivo_refugo_id
               AND empresa_id = v_empresa_id;
        ELSIF v_has_legacy THEN
            SELECT id
              INTO v_motivo_id
              FROM public.qualidade_motivos_refugo
             WHERE id = p_motivo_refugo_id
               AND empresa_id = v_empresa_id;
        END IF;
    END IF;

    INSERT INTO public.industria_producao_apontamentos (
        empresa_id,
        operacao_id,
        usuario_id,
        tipo,
        quantidade_boa,
        quantidade_refugo,
        motivo_refugo,
        motivo_refugo_id,
        observacoes,
        created_at
    ) VALUES (
        v_empresa_id,
        p_operacao_id,
        v_usuario_id,
        'producao',
        p_quantidade_produzida,
        p_quantidade_refugo,
        p_motivo_refugo,
        v_motivo_id,
        p_observacoes,
        now()
    );

    UPDATE public.industria_producao_operacoes
    SET quantidade_produzida = COALESCE(quantidade_produzida, 0) + p_quantidade_produzida,
        quantidade_realizada = COALESCE(quantidade_realizada, 0) + p_quantidade_produzida,
        quantidade_refugo    = COALESCE(quantidade_refugo, 0) + p_quantidade_refugo,
        status = CASE WHEN p_finalizar THEN 'concluida' ELSE status END,
        updated_at = now()
    WHERE id = p_operacao_id;
END;
$$;

COMMIT;
