-- Cadastro de operadores (PIN/QR) e autenticação simplificada

begin;

-- Tabela de operadores
create table if not exists public.industria_operadores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  nome text not null,
  email text,
  pin_hash text not null,
  centros_trabalho_ids uuid[] default '{}'::uuid[],
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_industria_operadores_empresa on public.industria_operadores(empresa_id);

-- RLS
alter table public.industria_operadores enable row level security;
drop policy if exists "operadores_empresa" on public.industria_operadores;
create policy "operadores_empresa" on public.industria_operadores
  using (empresa_id = public.current_empresa_id());

-- trigger updated_at
drop trigger if exists tg_operadores_updated_at on public.industria_operadores;
create trigger tg_operadores_updated_at
before update on public.industria_operadores
for each row execute function public.tg_set_updated_at();

-- Upsert de operador (permite trocar PIN)
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

-- Autenticação por PIN (e opcionalmente nome/email)
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
set search_path = pg_catalog, public
as $$
begin
  return query
  select o.id, o.nome, o.email, o.centros_trabalho_ids
    from public.industria_operadores o
   where o.empresa_id = public.current_empresa_id()
     and o.ativo = true
     and crypt(p_pin, o.pin_hash) = o.pin_hash
     and (
        p_nome is null
        or lower(o.nome) = lower(p_nome)
        or lower(coalesce(o.email, '')) = lower(p_nome)
     )
   limit 1;
end;
$$;

commit;
