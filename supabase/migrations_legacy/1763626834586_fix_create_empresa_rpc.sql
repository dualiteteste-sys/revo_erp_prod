/*
  # [FIX] create_empresa_and_link_owner — search_path + grants

  Impacto/Segurança:
  - search_path fixo: pg_catalog, public.
  - Mantém SECURITY DEFINER.
  - REVOKE ALL e GRANT para authenticated, service_role (uso via RPC).

  Compatibilidade:
  - Mantém assinatura e comportamento.
  - Idempotente.
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
DECLARE
  v_user_id         uuid := auth.uid();
  v_cnpj_normalized text := regexp_replace(p_cnpj, '\D', '', 'g');
  new_empresa_id    uuid;
BEGIN
  -- 1) Sessão deve existir
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING HINT = 'Faça login antes de criar a empresa.';
  END IF;

  -- 2) Valida CNPJ (14 dígitos ou nulo)
  IF v_cnpj_normalized IS NOT NULL AND length(v_cnpj_normalized) NOT IN (0, 14) THEN
    RAISE EXCEPTION 'invalid_cnpj_format' USING HINT = 'O CNPJ deve ter 14 dígitos ou ser nulo.';
  END IF;

  -- 3) Cria a empresa (idempotente por CNPJ)
  BEGIN
    INSERT INTO public.empresas (razao_social, fantasia, cnpj)
    VALUES (p_razao_social, p_fantasia, v_cnpj_normalized)
    RETURNING id INTO new_empresa_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT e.id INTO new_empresa_id
    FROM public.empresas e
    WHERE e.cnpj = v_cnpj_normalized;
  END;

  -- 4) Vínculo do usuário (idempotente)
  BEGIN
    INSERT INTO public.empresa_usuarios (empresa_id, user_id, role)
    VALUES (new_empresa_id, v_user_id, 'admin');
  EXCEPTION WHEN unique_violation THEN
    -- já existia o vínculo, segue
    NULL;
  END;

  -- 5) Garante assinatura "trialing" + 30 dias (idempotente)
  BEGIN
    INSERT INTO public.subscriptions (empresa_id, status, current_period_end)
    VALUES (new_empresa_id, 'trialing', now() + interval '30 days');
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- 6) Retorna a empresa criada/encontrada
  RETURN QUERY
    SELECT e.id, e.razao_social, e.fantasia, e.cnpj
    FROM public.empresas e
    WHERE e.id = new_empresa_id;
END;
$$;

-- Privilégios
revoke all on function public.create_empresa_and_link_owner(text, text, text) from public;
grant execute on function public.create_empresa_and_link_owner(text, text, text) to authenticated, service_role;
