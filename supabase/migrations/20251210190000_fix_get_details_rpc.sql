
-- Update RPC to include 'quantidade_reservada' in components list
CREATE OR REPLACE FUNCTION public.industria_producao_get_ordem_details(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_ordem record;
  v_componentes jsonb;
  v_entregas jsonb;
begin
  -- 1. Buscando a ordem
  select 
    o.*,
    p.nome as produto_nome
  into v_ordem
  from public.industria_producao_ordens o
  join public.produtos p on p.id = o.produto_final_id
  where o.id = p_id;

  if not found then
    return null;
  end if;

  -- 2. Buscando componentes com nome do produto
  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'ordem_id', c.ordem_id,
      'produto_id', c.produto_id,
      'produto_nome', p.nome,
      'quantidade_planejada', c.quantidade_planejada,
      'quantidade_consumida', c.quantidade_consumida,
      'quantidade_reservada', c.quantidade_reservada, -- Added this column
      'unidade', c.unidade,
      'origem', c.origem
    )
  )
  into v_componentes
  from public.industria_producao_componentes c
  join public.produtos p on p.id = c.produto_id
  where c.ordem_id = p_id;

  -- 3. Buscando entregas
  select jsonb_agg(e)
  into v_entregas
  from public.industria_producao_entregas e
  where e.ordem_id = p_id;

  -- 4. Retornando objeto completo
  return jsonb_build_object(
    'id', v_ordem.id,
    'empresa_id', v_ordem.empresa_id,
    'numero', v_ordem.numero,
    'origem_ordem', v_ordem.origem_ordem,
    'produto_final_id', v_ordem.produto_final_id,
    'produto_nome', v_ordem.produto_nome,
    'quantidade_planejada', v_ordem.quantidade_planejada,
    'unidade', v_ordem.unidade,
    'status', v_ordem.status,
    'prioridade', v_ordem.prioridade,
    'data_prevista_inicio', v_ordem.data_prevista_inicio,
    'data_prevista_fim', v_ordem.data_prevista_fim,
    'data_prevista_entrega', v_ordem.data_prevista_entrega,
    'documento_ref', v_ordem.documento_ref,
    'observacoes', v_ordem.observacoes,
    'roteiro_aplicado_id', v_ordem.roteiro_aplicado_id,
    'roteiro_aplicado_desc', v_ordem.roteiro_aplicado_desc,
    'bom_aplicado_id', v_ordem.bom_aplicado_id,
    'bom_aplicado_desc', v_ordem.bom_aplicado_desc,
    'lote_producao', v_ordem.lote_producao,
    'reserva_modo', v_ordem.reserva_modo,
    'tolerancia_overrun_percent', v_ordem.tolerancia_overrun_percent,
    'created_at', v_ordem.created_at,
    'updated_at', v_ordem.updated_at,
    'componentes', coalesce(v_componentes, '[]'::jsonb),
    'entregas', coalesce(v_entregas, '[]'::jsonb)
  );
end;
$function$;
