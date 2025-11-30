/*
  # Fix logistica_transportadoras_list return type

  ## Query Description
  Corrige o tipo de retorno da coluna 'uf' na função logistica_transportadoras_list.
  A coluna na tabela é char(2) mas a função define o retorno como text.
  Adiciona um cast explícito t.uf::text para resolver o erro "structure of query does not match function result type".

  ## Impact Summary
  - Segurança: Mantém definer/search_path.
  - Compatibilidade: Corrige erro 400 na listagem.
  - Reversibilidade: Reversível.
*/

create or replace function public.logistica_transportadoras_list(
  p_search text   default null,
  p_ativo  boolean default null,
  p_limit  int    default 50,
  p_offset int    default 0
)
returns table (
  id                   uuid,
  nome                 text,
  codigo               text,
  documento            text,
  cidade               text,
  uf                   text,
  modal_principal      text,
  frete_tipo_padrao    text,
  prazo_medio_dias     int,
  exige_agendamento    boolean,
  ativo                boolean,
  padrao_para_frete    boolean
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
    t.id,
    t.nome,
    t.codigo,
    t.documento,
    t.cidade,
    t.uf::text, -- CAST EXPLÍCITO AQUI
    t.modal_principal,
    t.frete_tipo_padrao,
    t.prazo_medio_dias,
    t.exige_agendamento,
    t.ativo,
    t.padrao_para_frete
  from public.logistica_transportadoras t
  where t.empresa_id = v_empresa_id
    and (p_ativo is null or t.ativo = p_ativo)
    and (
      p_search is null
      or t.nome ilike '%' || p_search || '%'
      or coalesce(t.codigo, '')    ilike '%' || p_search || '%'
      or coalesce(t.documento, '') ilike '%' || p_search || '%'
      or coalesce(t.cidade, '')    ilike '%' || p_search || '%'
    )
  order by
    t.ativo desc,
    t.nome asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.logistica_transportadoras_list from public;
grant execute on function public.logistica_transportadoras_list to authenticated, service_role;
