/*
  SEC: Enforce de "seats" (usuários) no banco — Estado da Arte+

  Motivo:
  - Antes: o trigger rodava só no INSERT e contava todos os vínculos (inclusive INACTIVE),
    permitindo exceder o limite ao fazer PENDING -> ACTIVE no aceite do convite.
  - Agora: o limite é aplicado quando o vínculo "conta como seat" (ACTIVE ou PENDING),
    e também no UPDATE, garantindo que aceitar convite / reativar usuário respeite o plano.

  Impacto:
  - Convites/ativação podem falhar com erro 23514 quando o limite for atingido.
  - O app deve orientar upgrade/ajuste de limite em Configurações → Minha Assinatura.

  Reversibilidade:
  - Reaplicar a migration anterior ou ajustar a função `public.enforce_empresa_max_users`.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_empresa_max_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max_users int := 999;
  v_current_counted int := 0;
  v_new_counted boolean := false;
BEGIN
  -- Service role (edge functions / jobs) não deve ser bloqueado por este guard.
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;

  v_new_counted := (coalesce(NEW.status::text, '') IN ('ACTIVE', 'PENDING'));
  IF NOT v_new_counted THEN
    -- INACTIVE/SUSPENDED não consomem seat.
    RETURN NEW;
  END IF;

  -- Default seguro: sem row configurada => não bloquear (999)
  SELECT COALESCE(
    (SELECT ee.max_users FROM public.empresa_entitlements ee WHERE ee.empresa_id = NEW.empresa_id),
    999
  )
  INTO v_max_users;

  -- Conta seats "ocupados/reservados": ACTIVE + PENDING (exclui o próprio vínculo sendo inserido/atualizado).
  SELECT COUNT(*)::int
  INTO v_current_counted
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = NEW.empresa_id
    AND eu.status::text IN ('ACTIVE', 'PENDING')
    AND NOT (eu.user_id = NEW.user_id AND eu.empresa_id = NEW.empresa_id);

  IF (v_current_counted + 1) > v_max_users THEN
    RAISE EXCEPTION
      'Limite de usuários atingido para esta empresa (%). Faça upgrade do plano ou ajuste o limite em Configurações.'
      , v_max_users
      USING errcode = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_empresa_max_users() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enforce_empresa_max_users() TO authenticated, service_role, postgres;

DROP TRIGGER IF EXISTS tg_empresa_usuarios_enforce_max_users ON public.empresa_usuarios;
CREATE TRIGGER tg_empresa_usuarios_enforce_max_users
BEFORE INSERT OR UPDATE OF status, empresa_id, user_id ON public.empresa_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.enforce_empresa_max_users();

SELECT pg_notify('pgrst','reload schema');

COMMIT;

