-- Add new columns to industria_producao_ordens
ALTER TABLE public.industria_producao_ordens
ADD COLUMN IF NOT EXISTS roteiro_aplicado_id uuid,
ADD COLUMN IF NOT EXISTS roteiro_aplicado_desc text,
ADD COLUMN IF NOT EXISTS bom_aplicado_id uuid,
ADD COLUMN IF NOT EXISTS bom_aplicado_desc text,
ADD COLUMN IF NOT EXISTS lote_producao text,
ADD COLUMN IF NOT EXISTS reserva_modo text DEFAULT 'ao_liberar' CHECK (reserva_modo IN ('ao_liberar', 'ao_planejar', 'sem_reserva')),
ADD COLUMN IF NOT EXISTS tolerancia_overrun_percent numeric DEFAULT 0 CHECK (tolerancia_overrun_percent >= 0 AND tolerancia_overrun_percent <= 100);

-- Update the RPC to handle new fields
CREATE OR REPLACE FUNCTION public.industria_producao_upsert_ordem(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.industria_producao_ordens
    set
      origem_ordem         = coalesce(p_payload->>'origem_ordem', 'manual'),
      produto_final_id     = (p_payload->>'produto_final_id')::uuid,
      quantidade_planejada = (p_payload->>'quantidade_planejada')::numeric,
      unidade              = p_payload->>'unidade',
      status               = coalesce(p_payload->>'status', 'rascunho'),
      prioridade           = coalesce((p_payload->>'prioridade')::int, 0),
      data_prevista_inicio = (p_payload->>'data_prevista_inicio')::date,
      data_prevista_fim    = (p_payload->>'data_prevista_fim')::date,
      data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
      documento_ref        = p_payload->>'documento_ref',
      observacoes          = p_payload->>'observacoes',
      -- New fields
      roteiro_aplicado_id        = (p_payload->>'roteiro_aplicado_id')::uuid,
      roteiro_aplicado_desc      = p_payload->>'roteiro_aplicado_desc',
      bom_aplicado_id            = (p_payload->>'bom_aplicado_id')::uuid,
      bom_aplicado_desc          = p_payload->>'bom_aplicado_desc',
      lote_producao              = p_payload->>'lote_producao',
      reserva_modo               = coalesce(p_payload->>'reserva_modo', 'ao_liberar'),
      tolerancia_overrun_percent = coalesce((p_payload->>'tolerancia_overrun_percent')::numeric, 0)
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_producao_ordens (
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
      -- New fields
      roteiro_aplicado_id,
      roteiro_aplicado_desc,
      bom_aplicado_id,
      bom_aplicado_desc,
      lote_producao,
      reserva_modo,
      tolerancia_overrun_percent
    ) values (
      v_empresa_id,
      coalesce(p_payload->>'origem_ordem', 'manual'),
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      -- New fields
      (p_payload->>'roteiro_aplicado_id')::uuid,
      p_payload->>'roteiro_aplicado_desc',
      (p_payload->>'bom_aplicado_id')::uuid,
      p_payload->>'bom_aplicado_desc',
      p_payload->>'lote_producao',
      coalesce(p_payload->>'reserva_modo', 'ao_liberar'),
      coalesce((p_payload->>'tolerancia_overrun_percent')::numeric, 0)
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_producao_upsert_ordem: ' || v_id);
  return public.industria_producao_get_ordem_details(v_id);
end;
$function$;
