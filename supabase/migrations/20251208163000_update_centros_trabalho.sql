-- Add new columns to industria_centros_trabalho
ALTER TABLE public.industria_centros_trabalho
ADD COLUMN IF NOT EXISTS tempo_setup_min integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS requer_inspecao_final boolean DEFAULT false;

-- Update list function
DROP FUNCTION IF EXISTS public.industria_centros_trabalho_list(text, boolean);

CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_list(p_search text DEFAULT NULL::text, p_ativo boolean DEFAULT NULL::boolean)
 RETURNS TABLE(id uuid, nome text, codigo text, descricao text, ativo boolean, capacidade_unidade_hora numeric, tipo_uso text, tempo_setup_min integer, requer_inspecao_final boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    c.id,
    c.nome,
    c.codigo,
    c.descricao,
    c.ativo,
    c.capacidade_unidade_hora,
    c.tipo_uso,
    c.tempo_setup_min,
    c.requer_inspecao_final
  from public.industria_centros_trabalho c
  where c.empresa_id = v_empresa_id
    and (p_ativo is null or c.ativo = p_ativo)
    and (
      p_search is null
      or c.nome   ilike '%' || p_search || '%'
      or c.codigo ilike '%' || p_search || '%'
    )
  order by
    c.ativo desc,
    c.nome asc;
end;
$function$;

-- Update upsert function
CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_upsert(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id         uuid;
  v_result     jsonb;
begin
  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome do centro de trabalho é obrigatório.';
  end if;

  if p_payload->>'id' is not null then
    update public.industria_centros_trabalho
    set
      nome                    = p_payload->>'nome',
      codigo                  = p_payload->>'codigo',
      descricao               = p_payload->>'descricao',
      ativo                   = coalesce((p_payload->>'ativo')::boolean, true),
      capacidade_unidade_hora = (p_payload->>'capacidade_unidade_hora')::numeric,
      tipo_uso                = coalesce(p_payload->>'tipo_uso', 'ambos'),
      tempo_setup_min         = coalesce((p_payload->>'tempo_setup_min')::integer, 0),
      requer_inspecao_final   = coalesce((p_payload->>'requer_inspecao_final')::boolean, false),
      updated_at              = now()
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
    
    if v_id is null then
      raise exception 'Centro de trabalho não encontrado ou acesso negado.';
    end if;

  else
    insert into public.industria_centros_trabalho (
      empresa_id,
      nome,
      codigo,
      descricao,
      ativo,
      capacidade_unidade_hora,
      tipo_uso,
      tempo_setup_min,
      requer_inspecao_final
    ) values (
      v_empresa_id,
      p_payload->>'nome',
      p_payload->>'codigo',
      p_payload->>'descricao',
      coalesce((p_payload->>'ativo')::boolean, true),
      (p_payload->>'capacidade_unidade_hora')::numeric,
      coalesce(p_payload->>'tipo_uso', 'ambos'),
      coalesce((p_payload->>'tempo_setup_min')::integer, 0),
      coalesce((p_payload->>'requer_inspecao_final')::boolean, false)
    )
    returning id into v_id;
  end if;

  select jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'codigo', c.codigo,
    'descricao', c.descricao,
    'ativo', c.ativo,
    'capacidade_unidade_hora', c.capacidade_unidade_hora,
    'tipo_uso', c.tipo_uso,
    'tempo_setup_min', c.tempo_setup_min,
    'requer_inspecao_final', c.requer_inspecao_final
  ) into v_result
  from public.industria_centros_trabalho c
  where c.id = v_id;

  return v_result;
end;
$function$;
