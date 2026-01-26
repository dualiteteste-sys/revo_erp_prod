-- ============================================================================
-- Fix: Definitive Tenant Resolution (Pre-Request Stickiness)
-- ============================================================================

BEGIN;

-- 1) Sobrescreve a função de resolução de tenant (usada em pre-request ou manualmente)
--    FIX: Agora ela OLHA O HEADER antes de olhar a tabela.
--    Isso impede que o "Estado da Tabela" (que pode estar em outra empresa na aba vizinha)
--    sobreescreva a intenção explícita desta requisição (Header).

CREATE OR REPLACE FUNCTION public._resolve_tenant_for_request()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
  v_guc text;
  v_headers json;
  v_header_emp uuid;
  v_header_val text;
begin
  -- se não há usuário (ex.: rota pública), não faz nada
  if v_uid is null then
    return;
  end if;

  -- A) Já veio GUC configurada (ex: por outro hook ou set_config manual)?
  --    Se sim, respeitamos (idempotência).
  --    NOTA: Comentei isso, pois queremos que o Header TENHA PREFERÊNCIA sobre GUCs antigos de mesma conexão.
  --    Mas em Transaction Mode, GUC deve estar limpo. Vamos manter por segurança, mas o Header é rei.
  -- v_guc := nullif(current_setting('app.current_empresa_id', true), '');
  -- if v_guc is not null then return; end if;

  -- B) Tenta Header HTTP (Prioridade Absoluta)
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_header_val := v_headers ->> 'x-empresa-id';
  exception when others then
    v_header_val := null;
  end;

  if v_header_val is not null then
    begin
      v_header_emp := v_header_val::uuid;
      -- Se header válido, setamos GUC imediatamente.
      -- O RLS (current_empresa_id) vai ler esse GUC.
      -- (Opcional: validar membership aqui ou deixar explodir no RLS. Deixamos setado.)
      perform set_config('app.current_empresa_id', v_header_emp::text, false);
      return;
    exception when others then
      -- Header inválido (não uuid), ignora e cai pro fallback
      null;
    end;
  end if;

  -- C) Fallback: preferência persistida ou vínculo único (Comportamento Legado)
  v_emp := public.get_preferred_empresa_for_user(v_uid);

  if v_emp is not null then
    perform set_config('app.current_empresa_id', v_emp::text, false);
    return;
  end if;

  -- D) Se chegou aqui, não tem tenant definido.
  --    Não lançamos erro AQUI, pois pode ser uma rota que não exige tenant (ex: listar empresas).
  --    O RLS das tabelas tenant-specific vai bloquear se app.current_empresa_id for null.
end;
$function$;

-- 2) Garante que esta função rode em TODA requisição via PostgREST
--    Isso "hidrata" o GUC app.current_empresa_id antes de qualquer SQL ser executado.
ALTER ROLE authenticated SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';
ALTER ROLE anon SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';
ALTER ROLE service_role SET "pgrst.db_pre_request" = 'public._resolve_tenant_for_request';

-- Em alguns setups, configura-se no authenticator ou no database.
-- Por precaução, configuramos no database também (se permissão permitir, senão ignora erro no script de CI).
-- DO $$
-- BEGIN
--   EXECUTE 'ALTER DATABASE ' || current_database() || ' SET "pgrst.db_pre_request" = ''public._resolve_tenant_for_request''';
-- EXCEPTION WHEN OTHERS THEN NULL;
-- END $$;

-- 3) Reload schema
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
