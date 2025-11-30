/*
  # [FIX] create_empresa_and_link_owner — preenche nome_razao_social

  Segurança
  - SECURITY DEFINER; search_path fixo (pg_catalog, public).
  - RLS preservada (escrita sob definer).
  - Privilégios mínimos: authenticated, service_role.

  Compatibilidade
  - Mesma assinatura/retorno (TABLE).
  - Continua idempotente por CNPJ.

  Reversibilidade
  - CREATE OR REPLACE.

  Performance
  - Irrelevante.
*/

create or replace function public.create_empresa_and_link_owner(
  p_razao_social text,
  p_fantasia     text,
  p_cnpj         text
)
returns table(empresa_id uuid, razao_social text, fantasia text, cnpj text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id          uuid := auth.uid();
  v_cnpj_normalized  text := regexp_replace(p_cnpj, '\D', '', 'g');
  v_razao            text := coalesce(nullif(p_razao_social,''), 'Empresa sem Nome');
  v_fant             text := nullif(p_fantasia,'');
  new_empresa_id     uuid;
begin
  -- 1) Sessão obrigatória
  if v_user_id is null then
    raise exception 'not_signed_in' using hint = 'Faça login antes de criar a empresa.';
  end if;

  -- 2) CNPJ 14 dígitos (ou nulo)
  if v_cnpj_normalized is not null and length(v_cnpj_normalized) not in (0,14) then
    raise exception 'invalid_cnpj_format' using hint = 'O CNPJ deve ter 14 dígitos ou ser nulo.';
  end if;

  -- 3) Cria empresa (preenche as duas colunas NOT NULL). Idempotente por CNPJ.
  begin
    insert into public.empresas (razao_social, nome_razao_social, fantasia, cnpj)
    values (v_razao,        v_razao,            v_fant,   v_cnpj_normalized)
    returning id into new_empresa_id;
  exception when unique_violation then
    select e.id into new_empresa_id
    from public.empresas e
    where e.cnpj = v_cnpj_normalized;
  end;

  -- 4) Vincula usuário como admin (idempotente)
  begin
    insert into public.empresa_usuarios (empresa_id, user_id, role)
    values (new_empresa_id, v_user_id, 'admin');
  exception when unique_violation then
    null;
  end;

  -- 5) Trial (idempotente)
  begin
    insert into public.subscriptions (empresa_id, status, current_period_end)
    values (new_empresa_id, 'trialing', now() + interval '30 days');
  exception when unique_violation then
    null;
  end;

  -- 6) Retorno
  return query
    select e.id, e.razao_social, e.fantasia, e.cnpj
    from public.empresas e
    where e.id = new_empresa_id;
end;
$$;

-- Privilégios mínimos
revoke all on function public.create_empresa_and_link_owner(text, text, text) from public;
grant execute on function public.create_empresa_and_link_owner(text, text, text) to authenticated, service_role;
