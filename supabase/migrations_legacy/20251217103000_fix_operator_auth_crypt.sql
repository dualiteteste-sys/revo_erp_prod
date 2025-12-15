-- Ajusta industria_operador_autenticar para usar crypt do pgcrypto (schema extensions)
begin;

create extension if not exists pgcrypto;

drop function if exists public.industria_operador_autenticar(text, text);
create or replace function public.industria_operador_autenticar(
  p_pin text,
  p_nome text default null
) returns table (
  id uuid,
  nome text,
  email text,
  centros_trabalho_ids uuid[]
)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  return query
  select o.id, o.nome, o.email, o.centros_trabalho_ids
    from public.industria_operadores o
   where o.empresa_id = public.current_empresa_id()
     and o.ativo = true
     and extensions.crypt(p_pin, o.pin_hash) = o.pin_hash
     and (
        p_nome is null
        or lower(o.nome) = lower(p_nome)
        or lower(coalesce(o.email, '')) = lower(p_nome)
     )
   limit 1;
end;
$$;

commit;
