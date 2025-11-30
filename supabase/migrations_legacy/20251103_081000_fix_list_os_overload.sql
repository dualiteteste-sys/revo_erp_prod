-- Fix: remove overload escalar de list_os_for_current_user (PGRST203)
-- Logs: [RPC][OS][LIST][FIX]

/*
  ## Query Description
  - Remove overload(es) com p_status escalar (public.status_os) que causam PGRST203 no PostgREST.
  - Mantém e/ou recria apenas a versão oficial com p_status public.status_os[] e ordenação dinâmica.

  ## Segurança
  - SECURITY DEFINER + set search_path = pg_catalog, public
  - Valida empresa com public.current_empresa_id()

  ## Compatibilidade
  - Frontend pode continuar chamando a mesma RPC; recomenda-se enviar sempre array (ex: ['aberta','orcamento']).

  ## Reversibilidade
  - Recriar overload escalar (não recomendado) ou reexecutar este script.
*/

-- 1) Derruba overloads ESCALARES herdados (com e sem order args)
drop function if exists public.list_os_for_current_user(text, public.status_os, int, int);
drop function if exists public.list_os_for_current_user(text, public.status_os, int, int, text, text);

-- 2) Garante a versão ARRAY com ordenação dinâmica (recria por segurança)
drop function if exists public.list_os_for_current_user(text, public.status_os[], int, int, text, text);

create function public.list_os_for_current_user(
  p_search    text default null,
  p_status    public.status_os[] default null,
  p_limit     int  default 50,
  p_offset    int  default 0,
  p_order_by  text default 'ordem',
  p_order_dir text default 'asc'
)
returns setof public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_emp uuid := public.current_empresa_id();
  v_q   text := nullif(btrim(coalesce(p_search,'')), '');
  v_order_by  text := coalesce(p_order_by, 'ordem');
  v_order_dir text := lower(coalesce(p_order_dir, 'asc'));
  v_limit  int := greatest(coalesce(p_limit,50), 1);
  v_offset int := greatest(coalesce(p_offset,0), 0);
  v_order_clause text;
begin
  if v_emp is null then
    raise exception '[RPC][OS][LIST] empresa_id inválido' using errcode='42501';
  end if;

  -- Whitelist defensiva para ORDER BY
  if v_order_by not in ('ordem','numero','descricao','status','data_inicio','total_geral','created_at') then
    v_order_by := 'ordem';
  end if;

  if v_order_dir not in ('asc','desc') then
    v_order_dir := 'asc';
  end if;

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
$fn$;

-- 3) Grants mínimos
revoke all on function public.list_os_for_current_user(text, public.status_os[], int, int, text, text) from public;
grant execute on function public.list_os_for_current_user(text, public.status_os[], int, int, text, text) to authenticated;
grant execute on function public.list_os_for_current_user(text, public.status_os[], int, int, text, text) to service_role;
