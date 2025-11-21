/*
  # [SOFTEN] ensure_request_context — não levantar erro em ausência de tenant

  Segurança:
  - Mantém SECURITY DEFINER e search_path = pg_catalog, public.
  - Sem empresa ativa, RLS continua negando linhas (safe-by-default).

  Compat/Reversibilidade:
  - Não muda assinatura; CREATE OR REPLACE reversível com a versão anterior.
*/

create or replace function public.ensure_request_context()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_guc text;
begin
  -- 1) Requisição anônima (landing, pricing público)? Não seta nada e segue.
  if v_uid is null then
    return;
  end if;

  -- 2) Se já veio a GUC (empresa ativa) externamente, respeita.
  v_guc := nullif(current_setting('app.current_empresa_id', true), '');
  if v_guc is not null then
    return;
  end if;

  -- 3) Resolve preferência persistida / vínculo único
  v_emp := public.get_preferred_empresa_for_user(v_uid);

  -- 4) Se conseguir resolver, seta; senão, apenas retorna (sem exception).
  if v_emp is not null then
    perform set_config('app.current_empresa_id', v_emp::text, false);
  end if;

  return;
end;
$$;
