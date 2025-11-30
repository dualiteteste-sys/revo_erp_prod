-- 20251103_040000_os_clients_autocomplete.sql
-- Autocomplete de clientes para OS (multi-tenant, SECURITY DEFINER)
-- Logs: [RPC] [CLIENTS][SEARCH]

-- Assumimos public.pessoas(id, empresa_id, nome, documento).
-- Ajuste os nomes de tabela/colunas se necessário.

create or replace function public.search_clients_for_current_user(
  p_search text default null,
  p_limit  int  default 20
)
returns table (
  id uuid,
  label text,          -- texto para exibir (nome + doc)
  nome text,
  documento text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_q   text := coalesce(p_search, '');
  v_q_digits text := regexp_replace(v_q, '\D', '', 'g');
begin
  if v_emp is null then
    raise exception '[CLIENTS][SEARCH] empresa_id inválido' using errcode='42501';
  end if;

  return query
  select
    p.id,
    trim(coalesce(p.nome,'') ||
         case when coalesce(p.documento,'') <> '' then ' — '||p.documento else '' end) as label,
    p.nome,
    p.documento
  from public.pessoas p
  where p.empresa_id = v_emp
    and (
      v_q is null or btrim(v_q) = ''
      or p.nome ilike '%'||v_q||'%'
      -- normaliza ambos os lados para casar "123.456.789-00" ~ "12345678900"
      or regexp_replace(coalesce(p.documento,''), '\D', '', 'g') ilike '%'||v_q_digits||'%'
    )
  order by p.nome asc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.search_clients_for_current_user(text, int) from public;
grant execute on function public.search_clients_for_current_user(text, int) to authenticated;
grant execute on function public.search_clients_for_current_user(text, int) to service_role;
