-- 20251103_083000_add_client_name_to_os_list.sql (CORRIGIDA)
-- Adiciona cliente_nome à listagem de O.S. com JOIN seguro
-- Logs: [RPC][OS][LIST][ENH]

-- 0) Índice de apoio (se ainda não existir)
create index if not exists idx_pessoas_emp_nome
  on public.pessoas (empresa_id, nome);

-- 1) DROP da função existente (assinatura muda de SETOF tabela → RETURNS TABLE)
drop function if exists public.list_os_for_current_user(text, public.status_os[], int, int, text, text);

-- 2) Recria com JOIN seguro + ORDER BY dinâmico com whitelist
create function public.list_os_for_current_user(
  p_search    text default null,
  p_status    public.status_os[] default null,
  p_limit     int  default 50,
  p_offset    int  default 0,
  p_order_by  text default 'ordem',
  p_order_dir text default 'asc'
)
returns table (
    id uuid,
    empresa_id uuid,
    numero bigint,
    cliente_id uuid,
    descricao text,
    status public.status_os,
    data_inicio date,
    data_prevista date,
    hora time,
    total_itens numeric,
    desconto_valor numeric,
    total_geral numeric,
    forma_recebimento text,
    condicao_pagamento text,
    observacoes text,
    observacoes_internas text,
    created_at timestamptz,
    updated_at timestamptz,
    ordem integer,
    cliente_nome text
)
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

  -- Whitelist de colunas para ORDER BY
  if v_order_by not in ('ordem','numero','cliente_nome','descricao','status','data_inicio','total_geral','created_at') then
    v_order_by := 'ordem';
  end if;

  if v_order_dir not in ('asc','desc') then
    v_order_dir := 'asc';
  end if;

  v_order_clause := format('order by %I %s nulls last, created_at desc', v_order_by, v_order_dir);

  return query execute
    'select
        os.id, os.empresa_id, os.numero, os.cliente_id, os.descricao, os.status,
        os.data_inicio, os.data_prevista, os.hora, os.total_itens, os.desconto_valor,
        os.total_geral, os.forma_recebimento, os.condicao_pagamento, os.observacoes,
        os.observacoes_internas, os.created_at, os.updated_at, os.ordem,
        p.nome as cliente_nome
       from public.ordem_servicos os
       left join public.pessoas p
              on p.id = os.cliente_id
             and p.empresa_id = os.empresa_id
      where os.empresa_id = $1
        and ($2 is null or os.status = any($2))
        and (
             $3 is null
          or os.numero::text ilike ''%''||$3||''%''
          or coalesce(os.descricao,'''') ilike ''%''||$3||''%''
          or coalesce(os.observacoes,'''') ilike ''%''||$3||''%''
          or coalesce(p.nome,'''') ilike ''%''||$3||''%''
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
