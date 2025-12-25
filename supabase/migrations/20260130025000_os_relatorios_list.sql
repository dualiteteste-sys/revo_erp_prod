/*
  Serviços (OS): Drill-down de relatórios (lista detalhada)

  - Lista paginada para visão detalhada por período/status/cliente/busca
  - Usa data de referência: data_conclusao -> data_inicio -> created_at::date
*/

create or replace function public.os_relatorios_list(
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null,
  p_status public.status_os[] default null,
  p_cliente_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  id uuid,
  numero bigint,
  descricao text,
  status public.status_os,
  data_ref date,
  cliente_nome text,
  total_geral numeric,
  custo_real numeric,
  margem numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
begin
  if v_empresa is null then
    raise exception '[OS][RELATORIOS][LIST] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  return query
  with base as (
    select
      os.id,
      os.numero,
      os.descricao,
      os.status,
      coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) as data_ref,
      p.nome as cliente_nome,
      os.total_geral,
      os.custo_real
    from public.ordem_servicos os
    left join public.pessoas p
      on p.id = os.cliente_id
     and p.empresa_id = v_empresa
    where os.empresa_id = v_empresa
      and coalesce(os.data_conclusao, os.data_inicio, (os.created_at::date)) between v_start and v_end
      and (p_cliente_id is null or os.cliente_id = p_cliente_id)
      and (p_status is null or array_length(p_status, 1) is null or os.status = any (p_status))
      and (
        p_search is null
        or btrim(p_search) = ''
        or os.descricao ilike '%'||p_search||'%'
        or coalesce(p.nome,'') ilike '%'||p_search||'%'
        or os.numero::text ilike '%'||p_search||'%'
      )
  )
  select
    b.id,
    b.numero,
    b.descricao,
    b.status,
    b.data_ref,
    b.cliente_nome,
    coalesce(b.total_geral, 0) as total_geral,
    coalesce(b.custo_real, 0) as custo_real,
    coalesce(b.total_geral, 0) - coalesce(b.custo_real, 0) as margem,
    count(*) over() as total_count
  from base b
  order by b.data_ref desc, b.numero desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.os_relatorios_list(date, date, text, public.status_os[], uuid, int, int) from public;
grant execute on function public.os_relatorios_list(date, date, text, public.status_os[], uuid, int, int) to authenticated, service_role;

