/*
  # [FIX] provision_empresa_for_current_user — preenche nome_razao_social

  Impacto / Segurança
  - SECURITY DEFINER + search_path fixo (pg_catalog, public).
  - Mantém a função exposta a authenticated; escritas passam sob definer (RLS preservada).

  Compatibilidade
  - Mesma assinatura/retorno (RETURNS empresas).
  - Apenas inclui a coluna obrigatória; vinculação do usuário preservada.

  Reversibilidade
  - CREATE OR REPLACE.

  Performance
  - Irrelevante.
*/

create or replace function public.provision_empresa_for_current_user(
  p_razao_social text,
  p_fantasia     text,
  p_email        text default null
)
returns public.empresas
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := public.current_user_id();
  v_emp     public.empresas;
  v_razao   text := coalesce(nullif(p_razao_social,''), 'Empresa sem Nome');
  v_fant    text := nullif(p_fantasia,'');
  v_email   text := nullif(p_email,'');
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Cria empresa preenchendo as duas colunas NOT NULL
  insert into public.empresas (razao_social, nome_razao_social, fantasia, email)
  values (v_razao,          v_razao,            v_fant,   v_email)
  returning * into v_emp;

  -- Vincula o usuário como membro (idempotente; coluna role é opcional)
  insert into public.empresa_usuarios (empresa_id, user_id)
  values (v_emp.id, v_user_id)
  on conflict do nothing;

  return v_emp;
end;
$function$;

-- Privilégios mínimos (mantidos)
revoke all on function public.provision_empresa_for_current_user(text, text, text) from public;
grant execute on function public.provision_empresa_for_current_user(text, text, text) to authenticated, service_role;
