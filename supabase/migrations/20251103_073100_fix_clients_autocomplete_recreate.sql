-- 20251103_073100_fix_clients_autocomplete_recreate.sql
-- Fix: recria a RPC com novo RETURNS TABLE (usa doc_unico)
-- Logs: [RPC] [CLIENTS][SEARCH]

-- 1) Remover versão anterior com assinatura antiga (necessário para mudar OUT params)
drop function if exists public.search_clients_for_current_user(text, int);

-- 2) (Opcional) Índice de apoio para busca por nome
create index if not exists idx_pessoas_emp_nome
  on public.pessoas (empresa_id, nome);

-- 3) RPC corrigida
create function public.search_clients_for_current_user(
  p_search text default null,
  p_limit  int  default 20
)
returns table (
  id uuid,
  label text,
  nome text,
  doc_unico text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_q   text := coalesce(p_search,'');
  v_q_digits text := regexp_replace(v_q, '\D', '', 'g');
begin
  if v_emp is null then
    raise exception '[CLIENTS][SEARCH] empresa_id inválido' using errcode='42501';
  end if;

  return query
  select
    p.id,
    trim(coalesce(p.nome,'') ||
         case when coalesce(p.doc_unico,'') <> '' then ' — '||p.doc_unico else '' end) as label,
    p.nome,
    p.doc_unico
  from public.pessoas p
  where p.empresa_id = v_emp
    and (
      v_q = ''                              -- após coalesce, v_q nunca é NULL
      or p.nome ilike '%'||v_q||'%'
      or regexp_replace(coalesce(p.doc_unico,''), '\D', '', 'g') ilike '%'||v_q_digits||'%'
    )
  order by p.nome asc
  limit greatest(p_limit, 1);
end;
$$;

-- 4) Permissões mínimas
revoke all on function public.search_clients_for_current_user(text, int) from public;
grant execute on function public.search_clients_for_current_user(text, int) to authenticated;
grant execute on function public.search_clients_for_current_user(text, int) to service_role;
