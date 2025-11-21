-- =============================================================================
-- Hotfix: Remover uso de 'json ? unknown' em current_user_id()
-- Padrões: SECURITY INVOKER, search_path fixo, idempotente
-- Racional: usar ->> 'sub' com cast seguro; evitar operador '?'
-- =============================================================================

-- 0) Substituir a função (drop + create para evitar caches de parâmetro/corpo)
DROP FUNCTION IF EXISTS public.current_user_id();

-- 1) Versão sem operador '?', com fallbacks e casts seguros
CREATE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'pg_catalog','public'
AS $$
DECLARE
  v_sub_text     text;
  v_claims_text  text;
  v_sub_uuid     uuid;
BEGIN
  -- Formato 1: request.jwt.claim.sub (string direta)
  BEGIN
    v_sub_text := NULLIF(current_setting('request.jwt.claim.sub', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_sub_text := NULL;
  END;

  IF v_sub_text IS NOT NULL THEN
    BEGIN
      v_sub_uuid := v_sub_text::uuid;
      RETURN v_sub_uuid;
    EXCEPTION WHEN OTHERS THEN
      -- sub não é UUID válido -> segue para próximo fallback
      v_sub_uuid := NULL;
    END;
  END IF;

  -- Formato 2: request.jwt.claims (json/jsonb) -> extrai 'sub' como texto
  BEGIN
    v_claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_claims_text := NULL;
  END;

  IF v_claims_text IS NOT NULL THEN
    BEGIN
      -- Não usamos '?'; apenas ->> 'sub' e cast para uuid
      RETURN ( (v_claims_text::json ->> 'sub')::uuid );
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL; -- claims presentes mas sem 'sub' válido
    END;
  END IF;

  -- Sem JWT (ex.: SQL Editor) ou tokens malformados
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION public.current_user_id() IS
  'Resolve o UUID do usuário a partir do JWT (request.jwt.claim.sub ou claims->>sub). Sem JWT retorna NULL.';

-- 2) Recarregar cache do PostgREST
SELECT pg_notify('pgrst','reload schema');
