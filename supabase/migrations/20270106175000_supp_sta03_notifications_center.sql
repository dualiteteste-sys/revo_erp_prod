/*
  SUPP-STA-03 — Central de notificações (incidentes/integrações/fiscal) com histórico

  Motivo
  - Reduz suporte: avisos proativos (DLQ, webhooks falhando, integrações desconectadas).
  - Centraliza histórico para o usuário/admin (sem precisar abrir Dev → Saúde).

  Impacto
  - Adiciona tabelas e RPCs de leitura/marcar como lido.
  - Adiciona triggers "best-effort" em tabelas de DLQ/webhooks se existirem no projeto.

  Reversibilidade
  - Reversível removendo as tabelas/funções/triggers.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'sistema' CHECK (category = ANY (ARRAY['sistema','integracao','fiscal','financeiro','incidente'])),
  severity text NOT NULL DEFAULT 'info' CHECK (severity = ANY (ARRAY['info','warn','error'])),
  title text NOT NULL,
  body text,
  source text,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_empresa_created ON public.app_notifications(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notifications_empresa_dedupe ON public.app_notifications(empresa_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.app_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.app_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_notification_reads_empresa_user ON public.app_notification_reads(empresa_id, user_id, read_at DESC);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_select ON public.app_notifications;
CREATE POLICY policy_select ON public.app_notifications
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_insert ON public.app_notifications;
CREATE POLICY policy_insert ON public.app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS policy_select ON public.app_notification_reads;
CREATE POLICY policy_select ON public.app_notification_reads
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS policy_insert ON public.app_notification_reads;
CREATE POLICY policy_insert ON public.app_notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS policy_delete ON public.app_notification_reads;
CREATE POLICY policy_delete ON public.app_notification_reads
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id() AND user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2) RPCs (Suporte)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.support_notifications_list(boolean, integer, integer);
CREATE OR REPLACE FUNCTION public.support_notifications_list(
  p_only_unread boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  category text,
  severity text,
  title text,
  body text,
  source text,
  entity_type text,
  entity_id uuid,
  is_read boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  PERFORM public.require_permission_for_current_user('suporte','view');

  RETURN QUERY
  SELECT
    n.id,
    n.created_at,
    n.category,
    n.severity,
    n.title,
    n.body,
    n.source,
    n.entity_type,
    n.entity_id,
    (r.id IS NOT NULL) AS is_read
  FROM public.app_notifications n
  LEFT JOIN public.app_notification_reads r
    ON r.notification_id = n.id
   AND r.empresa_id = v_empresa
   AND r.user_id = auth.uid()
  WHERE n.empresa_id = v_empresa
    AND (NOT COALESCE(p_only_unread, false) OR r.id IS NULL)
  ORDER BY n.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notifications_list(boolean, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_notifications_list(boolean, integer, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.support_notifications_mark_read(uuid[]);
CREATE OR REPLACE FUNCTION public.support_notifications_mark_read(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_count integer := 0;
BEGIN
  PERFORM public.require_permission_for_current_user('suporte','view');

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.app_notification_reads (empresa_id, notification_id, user_id, read_at)
  SELECT v_empresa, unnest(p_ids), auth.uid(), now()
  ON CONFLICT (empresa_id, notification_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notifications_mark_read(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_notifications_mark_read(uuid[]) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.support_notifications_mark_all_read();
CREATE OR REPLACE FUNCTION public.support_notifications_mark_all_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_count integer := 0;
BEGIN
  PERFORM public.require_permission_for_current_user('suporte','view');

  INSERT INTO public.app_notification_reads (empresa_id, notification_id, user_id, read_at)
  SELECT v_empresa, n.id, auth.uid(), now()
  FROM public.app_notifications n
  WHERE n.empresa_id = v_empresa
  ON CONFLICT (empresa_id, notification_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.support_notifications_mark_all_read() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_notifications_mark_all_read() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Ingestão "best-effort" via triggers (DLQ/webhooks)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public._app_notify_from_source(text, text, text, text, text, text, uuid, text);
CREATE OR REPLACE FUNCTION public._app_notify_from_source(
  p_category text,
  p_severity text,
  p_title text,
  p_body text,
  p_source text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.app_notifications (empresa_id, category, severity, title, body, source, entity_type, entity_id, dedupe_key)
  VALUES (v_empresa, p_category, p_severity, p_title, p_body, p_source, p_entity_type, p_entity_id, p_dedupe_key)
  ON CONFLICT (empresa_id, dedupe_key) DO NOTHING;
END;
$$;

-- Financeiro DLQ
DO $$
BEGIN
  IF to_regclass('public.finance_job_dead_letters') IS NOT NULL THEN
    EXECUTE $SQL$
      CREATE OR REPLACE FUNCTION public._notify_finance_dlq()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $fn$
      BEGIN
        PERFORM public._app_notify_from_source(
          'financeiro',
          'error',
          'Financeiro: job em DLQ',
          COALESCE(NEW.last_error, 'Falha ao processar job.'),
          'finance_job_dead_letters',
          'finance_dlq',
          NEW.id,
          'finance_dlq:' || NEW.id::text
        );
        RETURN NEW;
      END;
      $fn$;
    $SQL$;
    EXECUTE 'DROP TRIGGER IF EXISTS trg_notify_finance_dlq ON public.finance_job_dead_letters';
    EXECUTE 'CREATE TRIGGER trg_notify_finance_dlq AFTER INSERT ON public.finance_job_dead_letters FOR EACH ROW EXECUTE FUNCTION public._notify_finance_dlq()';
  END IF;
END$$;

-- Marketplaces DLQ
DO $$
BEGIN
  IF to_regclass('public.ecommerce_job_dead_letters') IS NOT NULL THEN
    EXECUTE $SQL$
      CREATE OR REPLACE FUNCTION public._notify_ecommerce_dlq()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $fn$
      BEGIN
        PERFORM public._app_notify_from_source(
          'integracao',
          'error',
          'Integrações: job em DLQ',
          COALESCE(NEW.last_error, 'Falha ao processar job.'),
          'ecommerce_job_dead_letters',
          'ecommerce_dlq',
          NEW.id,
          'ecommerce_dlq:' || NEW.id::text
        );
        RETURN NEW;
      END;
      $fn$;
    $SQL$;
    EXECUTE 'DROP TRIGGER IF EXISTS trg_notify_ecommerce_dlq ON public.ecommerce_job_dead_letters';
    EXECUTE 'CREATE TRIGGER trg_notify_ecommerce_dlq AFTER INSERT ON public.ecommerce_job_dead_letters FOR EACH ROW EXECUTE FUNCTION public._notify_ecommerce_dlq()';
  END IF;
END$$;

-- Stripe webhooks com falha
DO $$
BEGIN
  IF to_regclass('public.billing_stripe_webhook_events') IS NOT NULL THEN
    EXECUTE $SQL$
      CREATE OR REPLACE FUNCTION public._notify_stripe_webhook_fail()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $fn$
      BEGIN
        IF NEW.last_error IS NULL OR NEW.last_error = '' THEN
          RETURN NEW;
        END IF;
        PERFORM public._app_notify_from_source(
          'incidente',
          'error',
          'Stripe: webhook com falha',
          NEW.last_error,
          'billing_stripe_webhook_events',
          'stripe_webhook',
          NEW.id,
          'stripe_webhook:' || COALESCE(NEW.stripe_event_id, NEW.id::text)
        );
        RETURN NEW;
      END;
      $fn$;
    $SQL$;
    EXECUTE 'DROP TRIGGER IF EXISTS trg_notify_stripe_webhook_fail ON public.billing_stripe_webhook_events';
    EXECUTE 'CREATE TRIGGER trg_notify_stripe_webhook_fail AFTER INSERT OR UPDATE OF last_error ON public.billing_stripe_webhook_events FOR EACH ROW EXECUTE FUNCTION public._notify_stripe_webhook_fail()';
  END IF;
END$$;

-- NFE.io webhooks com falha (quando existir)
DO $$
BEGIN
  IF to_regclass('public.fiscal_nfe_webhook_events') IS NOT NULL THEN
    EXECUTE $SQL$
      CREATE OR REPLACE FUNCTION public._notify_nfe_webhook_fail()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $fn$
      BEGIN
        IF NEW.last_error IS NULL OR NEW.last_error = '' THEN
          RETURN NEW;
        END IF;
        PERFORM public._app_notify_from_source(
          'fiscal',
          'error',
          'NF-e: webhook com falha',
          NEW.last_error,
          'fiscal_nfe_webhook_events',
          'nfe_webhook',
          NEW.id,
          'nfe_webhook:' || NEW.id::text
        );
        RETURN NEW;
      END;
      $fn$;
    $SQL$;
    EXECUTE 'DROP TRIGGER IF EXISTS trg_notify_nfe_webhook_fail ON public.fiscal_nfe_webhook_events';
    EXECUTE 'CREATE TRIGGER trg_notify_nfe_webhook_fail AFTER INSERT OR UPDATE OF last_error ON public.fiscal_nfe_webhook_events FOR EACH ROW EXECUTE FUNCTION public._notify_nfe_webhook_fail()';
  END IF;
END$$;

COMMIT;

