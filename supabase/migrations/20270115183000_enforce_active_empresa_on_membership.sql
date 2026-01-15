/*
  Enforce multi-tenant context:
  - Evita "empresa ativa ausente" (403/42501) ao garantir que todo usuário com vínculo
    tenha um registro em public.user_active_empresa.
  - Mantém o registro atual quando ainda válido (não troca a empresa ativa em mudanças normais).
  - Se a empresa ativa ficou inválida (vínculo removido), escolhe uma empresa preferencial.

  Observação:
  - Para impedir que o usuário "zere" a empresa ativa acidentalmente via REST,
    removemos a policy de DELETE em user_active_empresa para authenticated.
    A troca continua via RPC set_active_empresa_for_current_user (SECURITY DEFINER).
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Trigger function: ensure user_active_empresa is valid/present
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tg_ensure_user_active_empresa();

CREATE OR REPLACE FUNCTION public.tg_ensure_user_active_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_current_emp uuid;
  v_next_emp uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Se já existe empresa ativa e o usuário ainda tem vínculo, mantém.
  SELECT uae.empresa_id
    INTO v_current_emp
    FROM public.user_active_empresa uae
   WHERE uae.user_id = v_user_id;

  IF v_current_emp IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.empresa_usuarios eu
     WHERE eu.user_id = v_user_id
       AND eu.empresa_id = v_current_emp
  ) THEN
    RETURN NULL;
  END IF;

  -- Escolhe a melhor candidata (principal primeiro, senão a mais recente).
  SELECT eu.empresa_id
    INTO v_next_emp
    FROM public.empresa_usuarios eu
   WHERE eu.user_id = v_user_id
   ORDER BY eu.is_principal DESC NULLS LAST, eu.created_at DESC
   LIMIT 1;

  -- Sem vínculos -> remove empresa ativa (se existir).
  IF v_next_emp IS NULL THEN
    DELETE FROM public.user_active_empresa WHERE user_id = v_user_id;
    RETURN NULL;
  END IF;

  -- Upsert da empresa ativa.
  INSERT INTO public.user_active_empresa (user_id, empresa_id)
  VALUES (v_user_id, v_next_emp)
  ON CONFLICT (user_id) DO UPDATE
    SET empresa_id = EXCLUDED.empresa_id,
        updated_at = now();

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_ensure_user_active_empresa() FROM public, anon;

-- -----------------------------------------------------------------------------
-- Trigger: after insert/update/delete on empresa_usuarios
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_empresa_usuarios_ensure_active_empresa ON public.empresa_usuarios;

CREATE TRIGGER tg_empresa_usuarios_ensure_active_empresa
AFTER INSERT OR UPDATE OR DELETE ON public.empresa_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.tg_ensure_user_active_empresa();

-- -----------------------------------------------------------------------------
-- Remove DELETE capability from authenticated on user_active_empresa (prevents accidental unset)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS user_active_empresa_del ON public.user_active_empresa;

COMMIT;

