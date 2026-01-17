/*
  P1.2 (RPC-first): Conciliação bancária — Regras
  - Centraliza operações em RPCs SECURITY DEFINER com enforcement RBAC.
  - Frontend deixa de usar `supabase.from('financeiro_conciliacao_regras')`.
*/

BEGIN;

-- Listagem (filtro opcional por conta_corrente_id)
DROP FUNCTION IF EXISTS public.financeiro_conciliacao_regras_list(uuid);
CREATE OR REPLACE FUNCTION public.financeiro_conciliacao_regras_list(
  p_conta_corrente_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  conta_corrente_id uuid,
  tipo_lancamento text,
  match_text text,
  min_valor numeric,
  max_valor numeric,
  categoria text,
  centro_custo text,
  descricao_override text,
  observacoes text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  RETURN QUERY
  SELECT
    r.id,
    r.empresa_id,
    r.conta_corrente_id,
    r.tipo_lancamento,
    r.match_text,
    r.min_valor,
    r.max_valor,
    r.categoria,
    r.centro_custo,
    r.descricao_override,
    r.observacoes,
    r.ativo,
    r.created_at,
    r.updated_at
  FROM public.financeiro_conciliacao_regras r
  WHERE r.empresa_id = public.current_empresa_id()
    AND (
      (p_conta_corrente_id IS NULL AND r.conta_corrente_id IS NULL)
      OR (p_conta_corrente_id IS NOT NULL AND r.conta_corrente_id = p_conta_corrente_id)
    )
  ORDER BY r.updated_at DESC;
END;
$$;

-- Upsert (id opcional)
DROP FUNCTION IF EXISTS public.financeiro_conciliacao_regras_upsert(jsonb);
CREATE OR REPLACE FUNCTION public.financeiro_conciliacao_regras_upsert(p_payload jsonb)
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  conta_corrente_id uuid,
  tipo_lancamento text,
  match_text text,
  min_valor numeric,
  max_valor numeric,
  categoria text,
  centro_custo text,
  descricao_override text,
  observacoes text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid := NULLIF(btrim(COALESCE(p_payload->>'id','')), '')::uuid;
  v_empresa_id uuid := public.current_empresa_id();
  v_conta uuid := NULLIF(btrim(COALESCE(p_payload->>'conta_corrente_id','')), '')::uuid;
  v_tipo text := NULLIF(btrim(COALESCE(p_payload->>'tipo_lancamento','')), '');
  v_match text := NULLIF(btrim(COALESCE(p_payload->>'match_text','')), '');
  v_min numeric := NULLIF(btrim(COALESCE(p_payload->>'min_valor','')), '')::numeric;
  v_max numeric := NULLIF(btrim(COALESCE(p_payload->>'max_valor','')), '')::numeric;
  v_cat text := NULLIF(btrim(COALESCE(p_payload->>'categoria','')), '');
  v_cc text := NULLIF(btrim(COALESCE(p_payload->>'centro_custo','')), '');
  v_desc text := NULLIF(btrim(COALESCE(p_payload->>'descricao_override','')), '');
  v_obs text := NULLIF(btrim(COALESCE(p_payload->>'observacoes','')), '');
  v_ativo boolean := COALESCE((p_payload->>'ativo')::boolean, true);
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','update');

  IF v_tipo IS NULL OR v_tipo NOT IN ('credito','debito') THEN
    RAISE EXCEPTION 'Tipo de lançamento inválido. Use crédito ou débito.' USING errcode = 'P0001';
  END IF;

  IF v_match IS NULL OR length(v_match) < 2 THEN
    RAISE EXCEPTION 'Informe um texto de busca (mínimo 2 caracteres).' USING errcode = 'P0001';
  END IF;

  IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
    RAISE EXCEPTION 'Faixa de valor inválida: mínimo maior que o máximo.' USING errcode = 'P0001';
  END IF;

  INSERT INTO public.financeiro_conciliacao_regras (
    id,
    empresa_id,
    conta_corrente_id,
    tipo_lancamento,
    match_text,
    min_valor,
    max_valor,
    categoria,
    centro_custo,
    descricao_override,
    observacoes,
    ativo
  )
  VALUES (
    COALESCE(v_id, gen_random_uuid()),
    v_empresa_id,
    v_conta,
    v_tipo,
    v_match,
    v_min,
    v_max,
    v_cat,
    v_cc,
    v_desc,
    v_obs,
    v_ativo
  )
  ON CONFLICT (id) DO UPDATE SET
    conta_corrente_id = EXCLUDED.conta_corrente_id,
    tipo_lancamento = EXCLUDED.tipo_lancamento,
    match_text = EXCLUDED.match_text,
    min_valor = EXCLUDED.min_valor,
    max_valor = EXCLUDED.max_valor,
    categoria = EXCLUDED.categoria,
    centro_custo = EXCLUDED.centro_custo,
    descricao_override = EXCLUDED.descricao_override,
    observacoes = EXCLUDED.observacoes,
    ativo = EXCLUDED.ativo,
    updated_at = now()
  RETURNING
    financeiro_conciliacao_regras.id,
    financeiro_conciliacao_regras.empresa_id,
    financeiro_conciliacao_regras.conta_corrente_id,
    financeiro_conciliacao_regras.tipo_lancamento,
    financeiro_conciliacao_regras.match_text,
    financeiro_conciliacao_regras.min_valor,
    financeiro_conciliacao_regras.max_valor,
    financeiro_conciliacao_regras.categoria,
    financeiro_conciliacao_regras.centro_custo,
    financeiro_conciliacao_regras.descricao_override,
    financeiro_conciliacao_regras.observacoes,
    financeiro_conciliacao_regras.ativo,
    financeiro_conciliacao_regras.created_at,
    financeiro_conciliacao_regras.updated_at;
END;
$$;

-- Delete
DROP FUNCTION IF EXISTS public.financeiro_conciliacao_regras_delete(uuid);
CREATE OR REPLACE FUNCTION public.financeiro_conciliacao_regras_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','delete');

  DELETE FROM public.financeiro_conciliacao_regras
  WHERE id = p_id
    AND empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conciliacao_regras_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conciliacao_regras_list(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.financeiro_conciliacao_regras_upsert(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conciliacao_regras_upsert(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.financeiro_conciliacao_regras_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conciliacao_regras_delete(uuid) TO authenticated, service_role;

COMMIT;

