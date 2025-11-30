-- 20251103_071000_os_list.sql
-- Listagem de OS por empresa (multi-tenant, segura)
-- Logs: [RPC] [OS][LIST]

/*
  ## Query Description
  - Cria a RPC list_os_for_current_user com filtros básicos.
  - Respeita RLS via SECURITY DEFINER e validação de empresa atual.
  - Inclui índices essenciais para performance em filtros/composição.

  ## Assinatura
  list_os_for_current_user(
    p_search text default null,                      -- busca em numero::text, descricao, observacoes
    p_status public.status_os[] default null,        -- filtra por 1 ou mais status
    p_limit int default 50,
    p_offset int default 0
  ) returns setof public.ordem_servicos

  ## Observações
  - Ordenação: mais recentes primeiro (created_at desc, numero desc fallback).
  - Indexes criados com IF NOT EXISTS (idempotente).
*/

-- Índices de apoio (idempotentes)
create index if not exists idx_os_empresa_created_at
  on public.ordem_servicos(empresa_id, created_at desc);

create index if not exists idx_os_empresa_status_created
  on public.ordem_servicos(empresa_id, status, created_at desc);

create index if not exists idx_os_empresa_numero
  on public.ordem_servicos(empresa_id, numero);

-- RPC principal
create or replace function public.list_os_for_current_user(
  p_search  text default null,
  p_status  public.status_os[] default null,
  p_limit   int  default 50,
  p_offset  int  default 0
)
returns setof public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_q   text := nullif(btrim(coalesce(p_search,'')), '');
begin
  if v_emp is null then
    raise exception '[RPC][OS][LIST] empresa_id inválido' using errcode='42501';
  end if;

  return query
  select os.*
  from public.ordem_servicos os
  where os.empresa_id = v_emp
    and (
      p_status is null
      or os.status = any(p_status)
    )
    and (
      v_q is null
      or os.numero::text ilike '%'||v_q||'%'
      or coalesce(os.descricao,'') ilike '%'||v_q||'%'
      or coalesce(os.observacoes,'') ilike '%'||v_q||'%'
    )
  order by os.created_at desc, os.numero desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);

  perform pg_notify('app_log', '[RPC] [OS][LIST] ok');
end;
$$;

revoke all on function public.list_os_for_current_user(text, public.status_os[], int, int) from public;
grant execute on function public.list_os_for_current_user(text, public.status_os[], int, int) to authenticated;
grant execute on function public.list_os_for_current_user(text, public.status_os[], int, int) to service_role;
