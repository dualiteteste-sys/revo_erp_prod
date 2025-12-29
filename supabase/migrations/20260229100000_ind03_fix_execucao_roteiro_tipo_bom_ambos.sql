-- =============================================================================
-- IND-03: Roteiro tipo_bom='ambos' deve ser elegível na geração de Execução (OP/OB)
-- Fix: industria_ordem_gerar_execucao__unsafe selecionava apenas tipo_bom exato (não pegava 'ambos')
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_ordem_gerar_execucao__unsafe(
  p_ordem_id uuid,
  p_roteiro_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_ord record;
  v_prod_ordem_id uuid;
  v_rot_id uuid;
  v_rot record;
  v_tipo_bom text;
  v_rot_desc text;
  v_ops_count int;
BEGIN
  IF to_regclass('public.industria_producao_ordens') IS NULL THEN
    RAISE EXCEPTION 'Módulo de Execução/Produção não está disponível (industria_producao_ordens não existe).';
  END IF;
  IF to_regclass('public.industria_producao_operacoes') IS NULL THEN
    RAISE EXCEPTION 'Módulo de Execução/Produção não está disponível (industria_producao_operacoes não existe).';
  END IF;

  SELECT *
    INTO v_ord
    FROM public.industria_ordens
   WHERE id = p_ordem_id
     AND empresa_id = v_empresa_id;

  IF v_ord.id IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
  END IF;

  -- Já existe vínculo de execução: garante operações e retorna
  IF v_ord.execucao_ordem_id IS NOT NULL THEN
    v_prod_ordem_id := v_ord.execucao_ordem_id;
    IF NOT EXISTS (SELECT 1 FROM public.industria_producao_operacoes WHERE ordem_id = v_prod_ordem_id) THEN
      PERFORM public.industria_producao_gerar_operacoes(v_prod_ordem_id);
    END IF;
    SELECT count(*)::int INTO v_ops_count FROM public.industria_producao_operacoes WHERE ordem_id = v_prod_ordem_id;
    RETURN jsonb_build_object(
      'producao_ordem_id', v_prod_ordem_id,
      'producao_ordem_numero', (SELECT numero FROM public.industria_producao_ordens WHERE id = v_prod_ordem_id),
      'operacoes', v_ops_count
    );
  END IF;

  v_tipo_bom := CASE WHEN v_ord.tipo_ordem = 'beneficiamento' THEN 'beneficiamento' ELSE 'producao' END;
  v_rot_id := COALESCE(p_roteiro_id, v_ord.roteiro_aplicado_id);

  IF v_rot_id IS NULL THEN
    -- Preferir tipo exato, mas permitir tipo_bom='ambos'
    SELECT r.id, r.codigo, r.descricao, r.versao, r.tipo_bom
      INTO v_rot
      FROM public.industria_roteiros r
     WHERE r.empresa_id = v_empresa_id
       AND r.produto_id = v_ord.produto_final_id
       AND r.tipo_bom IN (v_tipo_bom, 'ambos')
       AND r.ativo = true
     ORDER BY
       (CASE WHEN r.tipo_bom = v_tipo_bom THEN 1 ELSE 0 END) DESC,
       (CASE WHEN v_tipo_bom = 'beneficiamento' THEN r.padrao_para_beneficiamento ELSE r.padrao_para_producao END) DESC,
       r.versao DESC,
       r.created_at DESC
     LIMIT 1;

    v_rot_id := v_rot.id;
  ELSE
    SELECT r.id, r.codigo, r.descricao, r.versao, r.tipo_bom
      INTO v_rot
      FROM public.industria_roteiros r
     WHERE r.empresa_id = v_empresa_id
       AND r.id = v_rot_id
       AND r.ativo = true;
  END IF;

  IF v_rot.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum roteiro ativo encontrado para este produto (%), tipo %.', v_ord.produto_final_id, v_tipo_bom;
  END IF;

  v_rot_desc :=
    trim(both ' ' from
      coalesce(v_rot.codigo, '')
      || CASE WHEN v_rot.versao IS NOT NULL THEN ' (v' || v_rot.versao::text || ')' ELSE '' END
      || CASE WHEN v_rot.descricao IS NOT NULL AND v_rot.descricao <> '' THEN ' - ' || v_rot.descricao ELSE '' END
    );

  -- Cria ordem espelhada para Execução
  INSERT INTO public.industria_producao_ordens (
    empresa_id,
    origem_ordem,
    produto_final_id,
    quantidade_planejada,
    unidade,
    status,
    prioridade,
    data_prevista_inicio,
    data_prevista_fim,
    data_prevista_entrega,
    documento_ref,
    observacoes,
    roteiro_aplicado_id,
    roteiro_aplicado_desc
  ) VALUES (
    v_empresa_id,
    'manual',
    v_ord.produto_final_id,
    v_ord.quantidade_planejada,
    v_ord.unidade,
    CASE WHEN v_ord.status IN ('concluida','cancelada') THEN v_ord.status ELSE 'planejada' END,
    coalesce(v_ord.prioridade, 0),
    v_ord.data_prevista_inicio,
    v_ord.data_prevista_fim,
    v_ord.data_prevista_entrega,
    coalesce(
      nullif(v_ord.documento_ref, ''),
      (CASE WHEN v_ord.tipo_ordem = 'beneficiamento' THEN 'OB' ELSE 'OP' END) || '-' || v_ord.numero::text
    ),
    v_ord.observacoes,
    v_rot_id,
    nullif(v_rot_desc, '')
  )
  RETURNING id INTO v_prod_ordem_id;

  -- Copia componentes (mínimo comum entre schemas)
  INSERT INTO public.industria_producao_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    unidade
  )
  SELECT
    v_empresa_id,
    v_prod_ordem_id,
    c.produto_id,
    c.quantidade_planejada,
    c.unidade
  FROM public.industria_ordens_componentes c
  WHERE c.empresa_id = v_empresa_id
    AND c.ordem_id = p_ordem_id;

  -- Gera operações
  PERFORM public.industria_producao_gerar_operacoes(v_prod_ordem_id);
  SELECT count(*)::int INTO v_ops_count FROM public.industria_producao_operacoes WHERE ordem_id = v_prod_ordem_id;

  UPDATE public.industria_ordens
     SET execucao_ordem_id = v_prod_ordem_id,
         execucao_gerada_em = now(),
         roteiro_aplicado_id = v_rot_id,
         roteiro_aplicado_desc = nullif(v_rot_desc, '')
   WHERE id = p_ordem_id
     AND empresa_id = v_empresa_id;

  PERFORM pg_notify('app_log', '[RPC] industria_ordem_gerar_execucao: ordem=' || p_ordem_id || ' prod=' || v_prod_ordem_id);

  RETURN jsonb_build_object(
    'producao_ordem_id', v_prod_ordem_id,
    'producao_ordem_numero', (SELECT numero FROM public.industria_producao_ordens WHERE id = v_prod_ordem_id),
    'operacoes', v_ops_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.industria_ordem_gerar_execucao__unsafe(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.industria_ordem_gerar_execucao__unsafe(uuid, uuid) TO service_role, postgres;

-- Wrapper (public.industria_ordem_gerar_execucao) já existe via RBAC enforcement.
-- Força reload do schema cache do PostgREST (evita 404 em /rpc).
NOTIFY pgrst, 'reload schema';

COMMIT;

