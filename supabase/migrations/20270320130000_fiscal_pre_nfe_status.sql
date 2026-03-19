/*
  Fiscal 2026 — Parte 1D: Pré-NF-e Status + Change Status RPC

  Novos statuses (aditivos, backward-compatible):
    em_composicao         - novo initial status (Pré-NF-e criada, em edição)
    aguardando_validacao  - após "Validar"
    com_pendencias        - validação encontrou problemas
    pronta                - validação OK, pronta para emissão

  O status 'rascunho' permanece válido para NF-e existentes.

  Nova RPC: fiscal_nfe_emissao_change_status — valida transições permitidas.
  Atualiza fiscal_nfe_emissao_delete para aceitar novos statuses deletáveis.
*/

-- =========================================================
-- 1. RPC: fiscal_nfe_emissao_change_status
-- =========================================================
CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_change_status(
  p_emissao_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa      uuid := public.current_empresa_id();
  v_current      text;
  v_allowed_from text[];
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  -- Ler status atual
  SELECT status INTO v_current
  FROM public.fiscal_nfe_emissoes
  WHERE id = p_emissao_id AND empresa_id = v_empresa;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Emissão não encontrada.' USING errcode='42501';
  END IF;

  -- Validar transição
  CASE p_new_status
    WHEN 'em_composicao' THEN
      v_allowed_from := ARRAY['rascunho', 'com_pendencias', 'pronta'];
    WHEN 'aguardando_validacao' THEN
      v_allowed_from := ARRAY['rascunho', 'em_composicao', 'com_pendencias', 'pronta'];
    WHEN 'com_pendencias' THEN
      v_allowed_from := ARRAY['aguardando_validacao'];
    WHEN 'pronta' THEN
      v_allowed_from := ARRAY['aguardando_validacao', 'rascunho', 'em_composicao'];
    WHEN 'rascunho' THEN
      v_allowed_from := ARRAY['em_composicao', 'com_pendencias', 'pronta', 'erro', 'rejeitada'];
    ELSE
      RAISE EXCEPTION 'Status inválido: %', p_new_status USING errcode='22023';
  END CASE;

  IF v_current != ALL(v_allowed_from) THEN
    RAISE EXCEPTION 'Transição não permitida: % → %', v_current, p_new_status USING errcode='22023';
  END IF;

  -- Atualizar
  UPDATE public.fiscal_nfe_emissoes
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_emissao_id
    AND empresa_id = v_empresa;

  RETURN jsonb_build_object('ok', true, 'previous_status', v_current, 'new_status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_change_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_change_status(uuid, text) TO authenticated, service_role;


-- =========================================================
-- 2. Rewrite fiscal_nfe_emissao_delete para aceitar novos statuses
-- =========================================================
DROP FUNCTION IF EXISTS public.fiscal_nfe_emissao_delete(uuid);

CREATE OR REPLACE FUNCTION public.fiscal_nfe_emissao_delete(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  DELETE FROM public.fiscal_nfe_emissoes
  WHERE id = p_id
    AND empresa_id = v_empresa
    AND status IN ('rascunho', 'em_composicao', 'aguardando_validacao', 'com_pendencias', 'pronta', 'erro', 'rejeitada');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NF-e não encontrada ou em status não deletável.' USING errcode='42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfe_emissao_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfe_emissao_delete(uuid) TO authenticated, service_role;


-- =========================================================
-- 3. Atualizar fiscal_nfe_emissoes_list para filtrar novos statuses
-- =========================================================
-- A RPC existente filtra por p_status via =, então novos statuses já funcionam
-- sem alteração. Apenas precisamos garantir que a busca inclui os novos statuses
-- na UI (frontend), não no backend.


-- Notify PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');
