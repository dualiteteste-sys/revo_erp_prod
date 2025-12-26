/*
  RH: Treinamentos por colaborador — incluir validade/reciclagem

  Objetivo:
  - Permitir ao perfil do colaborador exibir validade do certificado e próxima reciclagem
  - Manter assinatura compatível (apenas adiciona colunas no retorno)
*/

BEGIN;

-- Precisa dropar antes para permitir alterar OUT parameters (Postgres não permite CREATE OR REPLACE mudando retorno)
DROP FUNCTION IF EXISTS public.rh_list_treinamentos_por_colaborador(uuid);

CREATE OR REPLACE FUNCTION public.rh_list_treinamentos_por_colaborador(
  p_colaborador_id uuid
)
RETURNS TABLE (
  treinamento_id uuid,
  treinamento_nome text,
  treinamento_status text,
  treinamento_tipo text,
  data_inicio timestamptz,
  data_fim timestamptz,
  participante_status text,
  nota_final numeric,
  eficacia_avaliada boolean,
  parecer_eficacia text,
  validade_ate date,
  proxima_reciclagem date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');

  RETURN QUERY
  SELECT
    t.id as treinamento_id,
    t.nome as treinamento_nome,
    t.status as treinamento_status,
    t.tipo as treinamento_tipo,
    t.data_inicio,
    t.data_fim,
    p.status as participante_status,
    p.nota_final,
    p.eficacia_avaliada,
    p.parecer_eficacia,
    p.validade_ate,
    p.proxima_reciclagem
  FROM public.rh_treinamento_participantes p
  JOIN public.rh_treinamentos t
    ON t.id = p.treinamento_id
  WHERE p.empresa_id = v_empresa_id
    AND t.empresa_id = v_empresa_id
    AND p.colaborador_id = p_colaborador_id
  ORDER BY t.data_inicio DESC NULLS LAST, t.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_treinamentos_por_colaborador(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_list_treinamentos_por_colaborador(uuid) TO authenticated, service_role;

-- Força reload do schema no PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
