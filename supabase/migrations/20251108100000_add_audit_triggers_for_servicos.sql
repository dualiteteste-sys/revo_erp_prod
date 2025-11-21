-- =============================================================================
-- MIGRAÇÃO: Instrumentação de auditoria via trigger (piloto: public.servicos)
-- Data: 2025-11-08
-- =============================================================================

-- 0) Garantias básicas
CREATE SCHEMA IF NOT EXISTS audit;

-- 1) Utilitário de diff (jsonb -> jsonb com {campo: {old, new}} apenas quando muda)
CREATE OR REPLACE FUNCTION audit.jsonb_diff(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = 'pg_catalog','public'
AS $$
WITH keys AS (
  SELECT key
  FROM (
    SELECT jsonb_object_keys(COALESCE(a, '{}'::jsonb))
    UNION
    SELECT jsonb_object_keys(COALESCE(b, '{}'::jsonb))
  ) t(key)
)
SELECT COALESCE(
  jsonb_object_agg(
    k.key,
    jsonb_build_object('old', a->k.key, 'new', b->k.key)
  ) FILTER (WHERE (a->k.key) IS DISTINCT FROM (b->k.key)),
  '{}'::jsonb
)
FROM keys k;
$$;

-- 2) Função SD para gravar evento (bypassa RLS de audit.events)
CREATE OR REPLACE FUNCTION audit._log_event(
  _empresa_id  uuid,
  _source      text,
  _table       text,
  _op          text,
  _actor_id    uuid,
  _actor_email text,
  _pk          jsonb,
  _row_old     jsonb,
  _row_new     jsonb,
  _meta        jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'pg_catalog','public'
AS $$
INSERT INTO audit.events (
  empresa_id, occurred_at, source, table_name, op,
  actor_id, actor_email, pk, row_old, row_new, diff, meta
) VALUES (
  _empresa_id, now(), _source, _table, _op,
  _actor_id, _actor_email, _pk, _row_old, _row_new,
  audit.jsonb_diff(_row_old, _row_new),
  _meta
);
$$;

-- Hardening da função
REVOKE ALL ON FUNCTION audit._log_event(uuid, text, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit._log_event(uuid, text, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

-- 3) Trigger genérico para linhas (assume coluna PK "id" e coluna "empresa_id")
CREATE OR REPLACE FUNCTION audit.tg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog','public'
AS $$
DECLARE
  v_actor_id   uuid;
  v_actor_email text;
  v_empresa_id uuid;
  v_pk         jsonb;
  v_old        jsonb;
  v_new        jsonb;
  v_meta       jsonb := NULL; -- reservado (ip/user_agent/etc se disponível)
BEGIN
  -- quem é o ator (se vier via JWT)
  BEGIN
    v_actor_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  BEGIN
    v_actor_email := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::json->>'email',
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_actor_email := NULL;
  END;

  -- empresa (tenta NEW, depois OLD)
  IF TG_OP IN ('INSERT','UPDATE') THEN
    BEGIN v_empresa_id := (NEW).empresa_id; EXCEPTION WHEN OTHERS THEN v_empresa_id := NULL; END;
  END IF;
  IF v_empresa_id IS NULL AND TG_OP IN ('UPDATE','DELETE') THEN
    BEGIN v_empresa_id := (OLD).empresa_id; EXCEPTION WHEN OTHERS THEN v_empresa_id := NULL; END;
  END IF;

  -- PK (assumimos coluna "id"; ajustar se a tabela usar outra PK)
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_pk := jsonb_build_object('id', to_jsonb((NEW).id));
  ELSE
    v_pk := jsonb_build_object('id', to_jsonb((OLD).id));
  END IF;

  -- Snapshots
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_new := to_jsonb(NEW); END IF;

  PERFORM audit._log_event(
    v_empresa_id,
    'trigger',
    TG_TABLE_NAME,
    TG_OP,
    v_actor_id,
    v_actor_email,
    v_pk,
    v_old,
    v_new,
    v_meta
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END
$$;

-- 4) Anexar aos DML da tabela piloto: public.servicos
DROP TRIGGER IF EXISTS tg_audit_servicos ON public.servicos;
CREATE TRIGGER tg_audit_servicos
AFTER INSERT OR UPDATE OR DELETE ON public.servicos
FOR EACH ROW
EXECUTE FUNCTION audit.tg_audit_row();

-- 5) Notificar PostgREST (atualiza cache de funções)
SELECT pg_notify('pgrst','reload schema');
