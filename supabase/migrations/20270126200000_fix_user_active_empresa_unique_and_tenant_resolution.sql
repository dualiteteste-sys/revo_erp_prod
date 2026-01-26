/*
  Fix multi-tenant "leak" / mismatch (Health → Verificar Produtos)

  Root cause:
  - `public.user_active_empresa` não tinha unicidade por `user_id`.
  - Com múltiplas linhas por usuário, funções diferentes escolhiam "a primeira" linha
    (ordem não determinística), causando `current_empresa_id()` ≠ `active_empresa_get_for_current_user()`.
  - Isso faz o backend resolver tenant errado e aparentar "vazamento" entre empresas.

  Fix:
  - Deduplica `user_active_empresa` (mantém a mais recente por updated_at).
  - Cria UNIQUE index em (user_id) para habilitar ON CONFLICT (user_id).
  - Torna `active_empresa_get_for_current_user()` determinístico (ORDER BY updated_at DESC).
  - Torna `get_preferred_empresa_for_user()` determinístico (ORDER BY updated_at DESC, LIMIT 1).
*/

BEGIN;

-- 1) Deduplica (mantém a mais recente por user_id)
WITH ranked AS (
  SELECT
    ctid,
    user_id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, empresa_id
    ) AS rn
  FROM public.user_active_empresa
),
to_delete AS (
  SELECT ctid FROM ranked WHERE rn > 1
)
DELETE FROM public.user_active_empresa u
USING to_delete d
WHERE u.ctid = d.ctid;

-- 2) Garante unicidade para permitir ON CONFLICT (user_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_empresa_user_id_unique
  ON public.user_active_empresa (user_id);

-- 3) Empresa ativa (RPC-first): determinístico
CREATE OR REPLACE FUNCTION public.active_empresa_get_for_current_user()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT uae.empresa_id
  FROM public.user_active_empresa uae
  WHERE uae.user_id = auth.uid()
  ORDER BY uae.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.active_empresa_get_for_current_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.active_empresa_get_for_current_user() TO authenticated, service_role;

-- 4) Preferência: determinístico e sempre 1 linha
CREATE OR REPLACE FUNCTION public.get_preferred_empresa_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
declare
  v_emp uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  -- 1) Persisted preference from user_active_empresa
  select uae.empresa_id
    into v_emp
    from public.user_active_empresa uae
   where uae.user_id = p_user_id
   order by uae.updated_at desc nulls last
   limit 1;

  if v_emp is not null then
    return v_emp;
  end if;

  -- 2) Fallback: user linked to exactly one company
  select eu.empresa_id
    into v_emp
    from public.empresa_usuarios eu
   where eu.user_id = p_user_id
   limit 1;

  if found and (
    select count(*) from public.empresa_usuarios where user_id = p_user_id
  ) = 1 then
    return v_emp;
  end if;

  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.get_preferred_empresa_for_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_preferred_empresa_for_user(uuid) TO authenticated, service_role, postgres;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

