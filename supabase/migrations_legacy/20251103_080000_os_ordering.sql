-- 20251103_080000_os_ordering.sql (CORRIGIDA)
-- Ordem manual de O.S. (drag & drop)
-- Logs: [DB][OS][ORDER] [RPC][OS][LIST]

/* Segurança:
   - SECURITY DEFINER + set search_path = pg_catalog, public
   - Validação de empresa em todas as operações
   Desempenho:
   - Índice (empresa_id, ordem)
   Reversibilidade:
   - DROP COLUMN ordem; DROP FUNCTIONs; DROP INDEX
*/

-- 1) Coluna de ordenação (idempotente)
alter table public.ordem_servicos
  add column if not exists ordem integer;

-- 2) Índice de apoio
create index if not exists idx_os_empresa_ordem
  on public.ordem_servicos (empresa_id, ordem);

-- 3) Listagem com ordenação dinâmica (DROP requerido se assinatura anterior diferir)
drop function if exists public.list_os_for_current_user(text, public.status_os[], int, int);
drop function if exists public.list_os_for_current_user(text, public.status_os[], int, int, text, text);

create function public.list_os_for_current_user(
  p_search   text default null,
  p_status   public.status_os[] default null,
  p_limit    int  default 50,
  p_offset   int  default 0,
  p_order_by text default 'ordem',
  p_order_dir text default 'asc'
)
returns setof public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_q   text := nullif(btrim(coalesce(p_search,'')), '');
  v_order_by text := coalesce(p_order_by, 'ordem');
  v_order_dir text := lower(coalesce(p_order_dir, 'asc'));
  v_limit int := greatest(coalesce(p_limit,50), 1);
  v_offset int := greatest(coalesce(p_offset,0), 0);
  v_order_clause text;
begin
  if v_emp is null then
    raise exception '[RPC][OS][LIST] empresa_id inválido' using errcode='42501';
  end if;

  -- Whitelist de colunas permitidas
  if v_order_by not in ('ordem','numero','descricao','status','data_inicio','total_geral','created_at') then
    v_order_by := 'ordem';
  end if;

  if v_order_dir not in ('asc','desc') then
    v_order_dir := 'asc';
  end if;

  -- Clausula ordenação estável (sempre com tie-break por created_at desc)
  v_order_clause := format('order by %I %s nulls last, created_at desc', v_order_by, v_order_dir);

  return query execute
    'select os.*
       from public.ordem_servicos os
      where os.empresa_id = $1
        and ($2 is null or os.status = any($2))
        and (
             $3 is null
          or os.numero::text ilike ''%''||$3||''%''
          or coalesce(os.descricao,'''') ilike ''%''||$3||''%''
          or coalesce(os.observacoes,'''') ilike ''%''||$3||''%''
        )
      ' || v_order_clause || '
      limit $4 offset $5'
  using v_emp, p_status, v_q, v_limit, v_offset;

  perform pg_notify('app_log', '[RPC] [OS][LIST] ok');
end;
$$;

revoke all on function public.list_os_for_current_user(text, public.status_os[], int, int, text, text) from public;
grant execute on function public.list_os_for_current_user(text, public.status_os[], int, int, text, text) to authenticated;
grant execute on function public.list_os_for_current_user(text, public.status_os[], int, int, text, text) to service_role;

-- 4) Atualização da ordem via drag & drop (usa WITH ORDINALITY)
create or replace function public.update_os_order(p_os_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[RPC][OS][ORDER] empresa_id inválido' using errcode='42501';
  end if;

  -- Quando array vazio/nulo, nada a fazer
  if p_os_ids is null or array_length(p_os_ids,1) is null then
    return;
  end if;

  with new_order as (
    select id, ord::int as ordem
      from unnest(p_os_ids) with ordinality as t(id, ord)
  )
  update public.ordem_servicos os
     set ordem = n.ordem,
         updated_at = now()
    from new_order n
   where os.id = n.id
     and os.empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] [OS][ORDER] reordenado ' || array_length(p_os_ids,1));
end;
$$;

revoke all on function public.update_os_order(uuid[]) from public;
grant execute on function public.update_os_order(uuid[]) to authenticated;
grant execute on function public.update_os_order(uuid[]) to service_role;
