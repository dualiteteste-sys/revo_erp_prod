/*
  OS: Kanban/Agenda - listagem v2 com filtros

  Motivo:
  - Permitir busca e filtro de status no Kanban/Agenda.
  - Manter compatibilidade com `list_kanban_os()` (legado).
*/

create or replace function public.list_kanban_os_v2(
  p_search text default null,
  p_status public.status_os[] default null
)
returns table(
  id uuid,
  numero bigint,
  descricao text,
  status public.status_os,
  data_prevista date,
  cliente_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status public.status_os[] := p_status;
begin
  if v_empresa is null then
    raise exception '[OS][KANBAN] empresa_id inválido' using errcode = '42501';
  end if;

  if v_status is null then
    v_status := array['orcamento'::public.status_os, 'aberta'::public.status_os];
  end if;

  return query
  select
    os.id,
    os.numero,
    os.descricao,
    os.status,
    os.data_prevista,
    p.nome as cliente_nome
  from public.ordem_servicos os
  left join public.pessoas p
    on p.id = os.cliente_id
  where os.empresa_id = v_empresa
    and os.status = any (v_status)
    and (
      p_search is null
      or os.descricao ilike '%'||p_search||'%'
      or coalesce(p.nome,'') ilike '%'||p_search||'%'
      or os.numero::text ilike '%'||p_search||'%'
    )
  order by os.data_prevista nulls last, os.numero asc;
end;
$$;

revoke all on function public.list_kanban_os_v2(text, public.status_os[]) from public;
grant execute on function public.list_kanban_os_v2(text, public.status_os[]) to authenticated, service_role;

