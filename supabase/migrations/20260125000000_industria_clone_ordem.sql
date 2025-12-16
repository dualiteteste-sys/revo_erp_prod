/*
  # Indústria - Duplicar Ordem (OP/OB)

  ## Objetivo
  - Criar uma nova ordem a partir de uma ordem existente (header + componentes)
  - Não duplica entregas por padrão (entrega é execução/resultado)
  - Mantém tipo (industrialização/beneficiamento) e vínculo de material do cliente (se houver)

  ## Segurança
  - SECURITY DEFINER + search_path fixo
  - Filtra por empresa_id = current_empresa_id()
*/

drop function if exists public.industria_clone_ordem(uuid);

create or replace function public.industria_clone_ordem(
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_src record;
  v_new_id uuid;
begin
  select *
  into v_src
  from public.industria_ordens o
  where o.id = p_source_id
    and o.empresa_id = v_empresa_id;

  if not found then
    raise exception 'Ordem não encontrada.';
  end if;

  insert into public.industria_ordens (
    empresa_id,
    tipo_ordem,
    produto_final_id,
    quantidade_planejada,
    unidade,
    cliente_id,
    status,
    prioridade,
    data_prevista_inicio,
    data_prevista_fim,
    data_prevista_entrega,
    documento_ref,
    observacoes,
    usa_material_cliente,
    material_cliente_id
  ) values (
    v_empresa_id,
    v_src.tipo_ordem,
    v_src.produto_final_id,
    v_src.quantidade_planejada,
    v_src.unidade,
    v_src.cliente_id,
    'rascunho',
    0,
    null,
    null,
    null,
    case
      when v_src.documento_ref is null or btrim(v_src.documento_ref) = '' then
        case when v_src.numero is not null then 'Clone da ordem ' || v_src.numero::text else 'Clone de ordem' end
      else
        '[CLONE] ' || v_src.documento_ref
    end,
    v_src.observacoes,
    coalesce(v_src.usa_material_cliente, false),
    v_src.material_cliente_id
  )
  returning id into v_new_id;

  insert into public.industria_ordens_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    unidade,
    origem
  )
  select
    v_empresa_id,
    v_new_id,
    c.produto_id,
    c.quantidade_planejada,
    c.unidade,
    c.origem
  from public.industria_ordens_componentes c
  where c.ordem_id = p_source_id
    and c.empresa_id = v_empresa_id;

  return public.industria_get_ordem_details(v_new_id);
end;
$$;

revoke all on function public.industria_clone_ordem(uuid) from public;
grant execute on function public.industria_clone_ordem(uuid) to authenticated, service_role;

