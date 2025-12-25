-- =============================================================================
-- Financeiro: Contas a Receber (base em migrations_legacy)
-- - tabela public.contas_a_receber + enum status_conta_receber
-- - RLS por empresa_id
-- - RPCs: count/list/get/upsert/delete/summary
-- =============================================================================

BEGIN;

-- Enum de status (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_conta_receber') THEN
    CREATE TYPE public.status_conta_receber AS ENUM ('pendente', 'pago', 'vencido', 'cancelado');
  END IF;
END$$;

-- Tabela principal (idempotente)
CREATE TABLE IF NOT EXISTS public.contas_a_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  data_vencimento date NOT NULL,
  status public.status_conta_receber NOT NULL DEFAULT 'pendente',
  data_pagamento date,
  valor_pago numeric(15,2),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at (idempotente)
DROP TRIGGER IF EXISTS on_contas_a_receber_updated ON public.contas_a_receber;
CREATE TRIGGER on_contas_a_receber_updated
  BEFORE UPDATE ON public.contas_a_receber
  FOR EACH ROW EXECUTE PROCEDURE public.tg_set_updated_at();

-- Índices essenciais
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_empresa_id ON public.contas_a_receber (empresa_id);
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_cliente_id ON public.contas_a_receber (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_a_receber_status ON public.contas_a_receber (status);

-- RLS
ALTER TABLE public.contas_a_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_a_receber FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contas_a_receber_select_policy ON public.contas_a_receber;
CREATE POLICY contas_a_receber_select_policy ON public.contas_a_receber
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS contas_a_receber_insert_policy ON public.contas_a_receber;
CREATE POLICY contas_a_receber_insert_policy ON public.contas_a_receber
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS contas_a_receber_update_policy ON public.contas_a_receber;
CREATE POLICY contas_a_receber_update_policy ON public.contas_a_receber
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS contas_a_receber_delete_policy ON public.contas_a_receber;
CREATE POLICY contas_a_receber_delete_policy ON public.contas_a_receber
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

-- RPCs seguras

CREATE OR REPLACE FUNCTION public.count_contas_a_receber(
  p_q text DEFAULT NULL,
  p_status public.status_conta_receber DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.contas_a_receber c
    LEFT JOIN public.pessoas p ON p.id = c.cliente_id
    WHERE c.empresa_id = public.current_empresa_id()
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_q IS NULL OR (
        c.descricao ILIKE '%'||p_q||'%' OR
        p.nome ILIKE '%'||p_q||'%'
      ))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_contas_a_receber(text, public.status_conta_receber) FROM public;
GRANT EXECUTE ON FUNCTION public.count_contas_a_receber(text, public.status_conta_receber) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_contas_a_receber(
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_q text DEFAULT NULL,
  p_status public.status_conta_receber DEFAULT NULL,
  p_order_by text DEFAULT 'data_vencimento',
  p_order_dir text DEFAULT 'asc'
)
RETURNS TABLE (
  id uuid,
  descricao text,
  cliente_nome text,
  data_vencimento date,
  valor numeric,
  status public.status_conta_receber
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.descricao,
    p.nome AS cliente_nome,
    c.data_vencimento,
    c.valor,
    c.status
  FROM public.contas_a_receber c
  LEFT JOIN public.pessoas p ON p.id = c.cliente_id
  WHERE c.empresa_id = public.current_empresa_id()
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_q IS NULL OR (
      c.descricao ILIKE '%'||p_q||'%' OR
      p.nome ILIKE '%'||p_q||'%'
    ))
  ORDER BY
    CASE WHEN p_order_by='descricao'       AND p_order_dir='asc'  THEN c.descricao END ASC,
    CASE WHEN p_order_by='descricao'       AND p_order_dir='desc' THEN c.descricao END DESC,
    CASE WHEN p_order_by='cliente_nome'    AND p_order_dir='asc'  THEN p.nome END ASC,
    CASE WHEN p_order_by='cliente_nome'    AND p_order_dir='desc' THEN p.nome END DESC,
    CASE WHEN p_order_by='data_vencimento' AND p_order_dir='asc'  THEN c.data_vencimento END ASC,
    CASE WHEN p_order_by='data_vencimento' AND p_order_dir='desc' THEN c.data_vencimento END DESC,
    CASE WHEN p_order_by='valor'           AND p_order_dir='asc'  THEN c.valor END ASC,
    CASE WHEN p_order_by='valor'           AND p_order_dir='desc' THEN c.valor END DESC,
    CASE WHEN p_order_by='status'          AND p_order_dir='asc'  THEN c.status END ASC,
    CASE WHEN p_order_by='status'          AND p_order_dir='desc' THEN c.status END DESC,
    c.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_conta_a_receber_details(p_id uuid)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rec public.contas_a_receber;
BEGIN
  SELECT * INTO rec
  FROM public.contas_a_receber
  WHERE id = p_id AND empresa_id = public.current_empresa_id();
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.get_conta_a_receber_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_conta_a_receber_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_update_conta_a_receber(p_payload jsonb)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  rec public.contas_a_receber;
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO public.contas_a_receber (
      empresa_id, cliente_id, descricao, valor, data_vencimento, status, data_pagamento, valor_pago, observacoes
    ) VALUES (
      public.current_empresa_id(),
      NULLIF(p_payload->>'cliente_id','')::uuid,
      p_payload->>'descricao',
      NULLIF(p_payload->>'valor','')::numeric,
      NULLIF(p_payload->>'data_vencimento','')::date,
      COALESCE(p_payload->>'status','pendente')::public.status_conta_receber,
      NULLIF(p_payload->>'data_pagamento','')::date,
      NULLIF(p_payload->>'valor_pago','')::numeric,
      p_payload->>'observacoes'
    )
    RETURNING * INTO rec;
  ELSE
    UPDATE public.contas_a_receber SET
      cliente_id      = NULLIF(p_payload->>'cliente_id','')::uuid,
      descricao       = p_payload->>'descricao',
      valor           = NULLIF(p_payload->>'valor','')::numeric,
      data_vencimento = NULLIF(p_payload->>'data_vencimento','')::date,
      status          = COALESCE(p_payload->>'status','pendente')::public.status_conta_receber,
      data_pagamento  = NULLIF(p_payload->>'data_pagamento','')::date,
      valor_pago      = NULLIF(p_payload->>'valor_pago','')::numeric,
      observacoes     = p_payload->>'observacoes'
    WHERE id = v_id AND empresa_id = public.current_empresa_id()
    RETURNING * INTO rec;
  END IF;

  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.create_update_conta_a_receber(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_update_conta_a_receber(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_conta_a_receber(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.contas_a_receber
  WHERE id = p_id AND empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_conta_a_receber(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_conta_a_receber(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_contas_a_receber_summary()
RETURNS TABLE(total_pendente numeric, total_pago_mes numeric, total_vencido numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS total_pendente,
    COALESCE(SUM(CASE WHEN status = 'pago' AND date_trunc('month', data_pagamento) = date_trunc('month', current_date) THEN valor_pago ELSE 0 END), 0) AS total_pago_mes,
    COALESCE(SUM(CASE WHEN status = 'vencido' THEN valor ELSE 0 END), 0) AS total_vencido
  FROM public.contas_a_receber
  WHERE empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.get_contas_a_receber_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.get_contas_a_receber_summary() TO authenticated;

COMMIT;

