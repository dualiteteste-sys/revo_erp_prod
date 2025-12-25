/*
  RH: Treinamentos por colaborador (para perfil / estado da arte)
*/

BEGIN;

create or replace function public.rh_list_treinamentos_por_colaborador(
  p_colaborador_id uuid
)
returns table (
  treinamento_id uuid,
  treinamento_nome text,
  treinamento_status text,
  treinamento_tipo text,
  data_inicio timestamptz,
  data_fim timestamptz,
  participante_status text,
  nota_final numeric,
  eficacia_avaliada boolean,
  parecer_eficacia text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    t.id as treinamento_id,
    t.nome as treinamento_nome,
    t.status as treinamento_status,
    t.tipo as treinamento_tipo,
    t.data_inicio,
    t.data_fim,
    p.status as participante_status,
    p.nota_final,
    p.eficacia_avaliada,
    p.parecer_eficacia
  from public.rh_treinamento_participantes p
  join public.rh_treinamentos t
    on t.id = p.treinamento_id
  where p.empresa_id = v_empresa_id
    and t.empresa_id = v_empresa_id
    and p.colaborador_id = p_colaborador_id
  order by t.data_inicio desc nulls last, t.created_at desc;
end;
$$;

revoke all on function public.rh_list_treinamentos_por_colaborador(uuid) from public, anon;
grant execute on function public.rh_list_treinamentos_por_colaborador(uuid) to authenticated, service_role;

COMMIT;

