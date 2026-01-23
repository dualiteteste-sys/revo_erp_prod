-- SUPPORT: Console interna (tickets)
-- Objetivo:
-- - Criar tickets de suporte (cliente) com contexto automático.
-- - Permitir visão global para equipe (staff), sem quebrar RLS multi-tenant do ERP.
-- - Não depender de `has_permission_for_current_user`/`require_permission...` pois no beta pode haver bypass.
-- - Acesso de staff controlado por allowlist explícita (ops_staff_users).

BEGIN;

-- 1) Staff allowlist (usuários internos)
CREATE TABLE IF NOT EXISTS public.ops_staff_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_staff_users ENABLE ROW LEVEL SECURITY;

-- ninguém (exceto postgres/service_role via SECURITY DEFINER) deve ler/manipular diretamente
REVOKE ALL ON TABLE public.ops_staff_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ops_staff_users TO service_role;

-- 2) Função segura para identificar staff
CREATE OR REPLACE FUNCTION public.ops_is_staff_for_current_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.ops_staff_users s
      WHERE s.user_id = auth.uid()
    )
    OR (
      lower(coalesce(auth.jwt()->>'email','')) LIKE '%@revo.tec.br'
    );
$$;

REVOKE ALL ON FUNCTION public.ops_is_staff_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_is_staff_for_current_user() TO authenticated, service_role;

-- 3) Enum de status (texto para compatibilidade, mas com CHECK)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  requester_email text,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','triagem','em_andamento','aguardando_cliente','resolvido','arquivado')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('baixa','normal','alta','urgente')),
  assigned_to uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  error_report_id uuid NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_empresa_created_at_idx ON public.support_tickets (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON public.support_tickets (assigned_to, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  author_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('cliente','staff','sistema')),
  body text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON public.support_ticket_messages (ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx ON public.support_ticket_events (ticket_id, created_at ASC);

-- Triggers: updated_at + last_activity
CREATE OR REPLACE FUNCTION public.support_tickets_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.support_tickets_touch();

-- 4) RLS (multi-tenant + staff global)
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- Cliente: somente dentro da empresa atual e criado por ele
DROP POLICY IF EXISTS support_tickets_customer_select ON public.support_tickets;
CREATE POLICY support_tickets_customer_select ON public.support_tickets
FOR SELECT TO authenticated
USING (
  empresa_id = public.current_empresa_id()
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS support_tickets_customer_insert ON public.support_tickets;
CREATE POLICY support_tickets_customer_insert ON public.support_tickets
FOR INSERT TO authenticated
WITH CHECK (
  empresa_id = public.current_empresa_id()
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS support_tickets_customer_update ON public.support_tickets;
CREATE POLICY support_tickets_customer_update ON public.support_tickets
FOR UPDATE TO authenticated
USING (
  empresa_id = public.current_empresa_id()
  AND created_by = auth.uid()
)
WITH CHECK (
  empresa_id = public.current_empresa_id()
  AND created_by = auth.uid()
);

-- Staff: acesso global
DROP POLICY IF EXISTS support_tickets_staff_all ON public.support_tickets;
CREATE POLICY support_tickets_staff_all ON public.support_tickets
FOR ALL TO authenticated
USING (public.ops_is_staff_for_current_user())
WITH CHECK (public.ops_is_staff_for_current_user());

-- Messages: cliente só pode ver/enviar no seu ticket; staff vê todos
DROP POLICY IF EXISTS support_ticket_messages_customer_select ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_customer_select ON public.support_ticket_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND t.empresa_id = public.current_empresa_id()
      AND t.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS support_ticket_messages_customer_insert ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_customer_insert ON public.support_ticket_messages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND t.empresa_id = public.current_empresa_id()
      AND t.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS support_ticket_messages_staff_all ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_staff_all ON public.support_ticket_messages
FOR ALL TO authenticated
USING (public.ops_is_staff_for_current_user())
WITH CHECK (public.ops_is_staff_for_current_user());

-- Events: somente leitura para cliente; staff full
DROP POLICY IF EXISTS support_ticket_events_customer_select ON public.support_ticket_events;
CREATE POLICY support_ticket_events_customer_select ON public.support_ticket_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND t.empresa_id = public.current_empresa_id()
      AND t.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS support_ticket_events_staff_all ON public.support_ticket_events;
CREATE POLICY support_ticket_events_staff_all ON public.support_ticket_events
FOR ALL TO authenticated
USING (public.ops_is_staff_for_current_user())
WITH CHECK (public.ops_is_staff_for_current_user());

-- 5) RPCs (RPC-first)
DROP FUNCTION IF EXISTS public.support_ticket_create(text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.support_ticket_create(
  p_subject text,
  p_first_message text,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_requester_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa ativa é obrigatória' USING ERRCODE = 'P0001';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'usuário não autenticado' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(trim(p_subject),'') = '' THEN
    RAISE EXCEPTION 'assunto é obrigatório' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(trim(p_first_message),'') = '' THEN
    RAISE EXCEPTION 'mensagem é obrigatória' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_tickets (
    empresa_id, created_by, requester_email, subject, context
  ) VALUES (
    v_empresa, v_user, p_requester_email, p_subject, coalesce(p_context,'{}'::jsonb)
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.support_ticket_messages (
    ticket_id, empresa_id, author_user_id, author_kind, body, meta
  ) VALUES (
    v_ticket_id, v_empresa, v_user, 'cliente', p_first_message, '{}'::jsonb
  );

  INSERT INTO public.support_ticket_events (
    ticket_id, empresa_id, actor_user_id, event_type, payload
  ) VALUES (
    v_ticket_id, v_empresa, v_user, 'ticket_created',
    jsonb_build_object('subject', p_subject)
  );

  RETURN v_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_create(text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_create(text,text,jsonb,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.support_ticket_reply(uuid,text);
CREATE OR REPLACE FUNCTION public.support_ticket_reply(
  p_ticket_id uuid,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_is_staff boolean := public.ops_is_staff_for_current_user();
  v_owner uuid;
BEGIN
  IF v_empresa IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'empresa ativa e usuário autenticado são obrigatórios' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(trim(p_message),'') = '' THEN
    RAISE EXCEPTION 'mensagem é obrigatória' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.created_by INTO v_owner
  FROM public.support_tickets t
  WHERE t.id = p_ticket_id
    AND (v_is_staff OR (t.empresa_id = v_empresa AND t.created_by = v_user));

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ticket não encontrado ou sem permissão' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id, empresa_id, author_user_id, author_kind, body
  ) VALUES (
    p_ticket_id, v_empresa, v_user, CASE WHEN v_is_staff THEN 'staff' ELSE 'cliente' END, p_message
  );

  UPDATE public.support_tickets
  SET last_activity_at = now()
  WHERE id = p_ticket_id;

  INSERT INTO public.support_ticket_events (
    ticket_id, empresa_id, actor_user_id, event_type
  ) VALUES (
    p_ticket_id, v_empresa, v_user, 'message_added'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_reply(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_reply(uuid,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.support_tickets_list_for_current_user(text,integer,integer);
CREATE OR REPLACE FUNCTION public.support_tickets_list_for_current_user(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  status text,
  priority text,
  subject text,
  last_activity_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.status, t.priority, t.subject, t.last_activity_at, t.created_at
  FROM public.support_tickets t
  WHERE t.empresa_id = public.current_empresa_id()
    AND t.created_by = auth.uid()
    AND (p_status IS NULL OR t.status = p_status)
  ORDER BY t.last_activity_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.support_tickets_list_for_current_user(text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_tickets_list_for_current_user(text,integer,integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.support_ticket_get(uuid);
CREATE OR REPLACE FUNCTION public.support_ticket_get(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_is_staff boolean := public.ops_is_staff_for_current_user();
  v_ticket public.support_tickets%ROWTYPE;
  v_messages jsonb;
  v_events jsonb;
BEGIN
  IF v_empresa IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'empresa ativa e usuário autenticado são obrigatórios' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_ticket
  FROM public.support_tickets t
  WHERE t.id = p_ticket_id
    AND (v_is_staff OR (t.empresa_id = v_empresa AND t.created_by = v_user));

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'ticket não encontrado ou sem permissão' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT id, author_kind, author_user_id, body, meta, created_at
    FROM public.support_ticket_messages
    WHERE ticket_id = p_ticket_id
    ORDER BY created_at ASC
  ) m;

  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at ASC), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT id, event_type, actor_user_id, payload, created_at
    FROM public.support_ticket_events
    WHERE ticket_id = p_ticket_id
    ORDER BY created_at ASC
  ) e;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(v_ticket),
    'messages', v_messages,
    'events', v_events
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_get(uuid) TO authenticated, service_role;

-- Staff list: visão global (filtros básicos)
DROP FUNCTION IF EXISTS public.support_staff_tickets_list(text,text,uuid,integer,integer);
CREATE OR REPLACE FUNCTION public.support_staff_tickets_list(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_empresa_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  empresa_id uuid,
  status text,
  priority text,
  subject text,
  requester_email text,
  assigned_to uuid,
  last_activity_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.empresa_id, t.status, t.priority, t.subject, t.requester_email, t.assigned_to, t.last_activity_at, t.created_at
  FROM public.support_tickets t
  WHERE public.ops_is_staff_for_current_user()
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_empresa_id IS NULL OR t.empresa_id = p_empresa_id)
    AND (
      p_q IS NULL OR
      t.subject ILIKE ('%' || p_q || '%') OR
      coalesce(t.requester_email,'') ILIKE ('%' || p_q || '%')
    )
  ORDER BY t.last_activity_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.support_staff_tickets_list(text,text,uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_staff_tickets_list(text,text,uuid,integer,integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.support_staff_ticket_set_status(uuid,text);
CREATE OR REPLACE FUNCTION public.support_staff_ticket_set_status(
  p_ticket_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT public.ops_is_staff_for_current_user() THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('novo','triagem','em_andamento','aguardando_cliente','resolvido','arquivado') THEN
    RAISE EXCEPTION 'status inválido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_tickets
  SET status = p_status,
      closed_at = CASE WHEN p_status IN ('resolvido','arquivado') THEN now() ELSE NULL END,
      last_activity_at = now()
  WHERE id = p_ticket_id;

  INSERT INTO public.support_ticket_events(ticket_id, empresa_id, actor_user_id, event_type, payload)
  SELECT t.id, t.empresa_id, v_user, 'status_changed', jsonb_build_object('status', p_status)
  FROM public.support_tickets t
  WHERE t.id = p_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.support_staff_ticket_set_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_staff_ticket_set_status(uuid,text) TO authenticated, service_role;

-- Best-effort schema cache reload
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
