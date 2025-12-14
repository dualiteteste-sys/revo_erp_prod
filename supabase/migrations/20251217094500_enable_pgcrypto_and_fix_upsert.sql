-- Garante pgcrypto e recria o upsert de operador com gen_salt/crypt funcionando
begin;

create extension if not exists pgcrypto;

drop function if exists public.industria_operador_upsert(uuid, text, text, text, uuid[], boolean);
create or replace function public.industria_operador_upsert(
  p_id uuid,
  p_nome text,
  p_email text,
  p_pin text,
  p_centros uuid[],
  p_ativo boolean
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null and p_pin is null then
    raise exception 'PIN é obrigatório';
  end if;

  if v_id is null then
    insert into public.industria_operadores (
      empresa_id, nome, email, pin_hash, centros_trabalho_ids, ativo
    ) values (
      public.current_empresa_id(),
      p_nome,
      p_email,
      crypt(p_pin, gen_salt('bf')),
      coalesce(p_centros, '{}'::uuid[]),
      coalesce(p_ativo, true)
    )
    returning id into v_id;
  else
    update public.industria_operadores
       set nome = coalesce(p_nome, nome),
           email = coalesce(p_email, email),
           centros_trabalho_ids = coalesce(p_centros, centros_trabalho_ids),
           ativo = coalesce(p_ativo, ativo),
           pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else pin_hash end
     where id = v_id
       and empresa_id = public.current_empresa_id();
  end if;
  return v_id;
end;
$$;

commit;
