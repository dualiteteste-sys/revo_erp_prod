-- =============================================================================
-- Financeiro: Contas a Pagar v2 (base em migrations_legacy)
-- - tabela public.financeiro_contas_pagar + RLS
-- - RPCs: financeiro_contas_pagar_list/get/upsert/delete/summary
-- =============================================================================

BEGIN;

-- Limpeza segura de funções (mantém idempotência entre ambientes)
DROP FUNCTION IF EXISTS public.financeiro_contas_pagar_count(text, text, date, date);
DROP FUNCTION IF EXISTS public.financeiro_contas_pagar_list(int, int, text, text, date, date);
DROP FUNCTION IF EXISTS public.financeiro_contas_pagar_get(uuid);
DROP FUNCTION IF EXISTS public.financeiro_contas_pagar_upsert(jsonb);
DROP FUNCTION IF EXISTS public.financeiro_contas_pagar_delete(uuid);
DROP FUNCTION IF EXISTS public.financeiro_contas_pagar_summary(date, date);

-- Tabela principal (idempotente)
CREATE TABLE IF NOT EXISTS public.financeiro_contas_pagar (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL DEFAULT public.current_empresa_id(),
  fornecedor_id      uuid,
  documento_ref      text,
  descricao          text,
  data_emissao       date,
  data_vencimento    date NOT NULL,
  data_pagamento     date,
  valor_total        numeric(15,2) NOT NULL CHECK (valor_total >= 0),
  valor_pago         numeric(15,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  multa              numeric(15,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  juros              numeric(15,2) NOT NULL DEFAULT 0 CHECK (juros >= 0),
  desconto           numeric(15,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  forma_pagamento    text,
  centro_custo       text,
  categoria          text,
  status             text NOT NULL DEFAULT 'aberta'
                     CHECK (status IN ('aberta','parcial','paga','cancelada')),
  observacoes        text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  CONSTRAINT financeiro_cp_empresa_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT financeiro_cp_fornecedor_fkey
    FOREIGN KEY (fornecedor_id) REFERENCES public.pessoas(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fin_cp_empresa
  ON public.financeiro_contas_pagar (empresa_id);

CREATE INDEX IF NOT EXISTS idx_fin_cp_empresa_status_venc
  ON public.financeiro_contas_pagar (empresa_id, status, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_fin_cp_empresa_fornecedor
  ON public.financeiro_contas_pagar (empresa_id, fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_fin_cp_empresa_busca
  ON public.financeiro_contas_pagar (empresa_id, documento_ref, descricao);

-- Trigger updated_at (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'handle_updated_at_financeiro_contas_pagar'
      AND tgrelid = 'public.financeiro_contas_pagar'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at_financeiro_contas_pagar
      BEFORE UPDATE ON public.financeiro_contas_pagar
      FOR EACH ROW
      EXECUTE PROCEDURE public.tg_set_updated_at();
  END IF;
END;
$$;

-- RLS
ALTER TABLE public.financeiro_contas_pagar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_cp_select ON public.financeiro_contas_pagar;
DROP POLICY IF EXISTS fin_cp_insert ON public.financeiro_contas_pagar;
DROP POLICY IF EXISTS fin_cp_update ON public.financeiro_contas_pagar;
DROP POLICY IF EXISTS fin_cp_delete ON public.financeiro_contas_pagar;

CREATE POLICY fin_cp_select
  ON public.financeiro_contas_pagar
  FOR SELECT
  USING (empresa_id = public.current_empresa_id());

CREATE POLICY fin_cp_insert
  ON public.financeiro_contas_pagar
  FOR INSERT
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY fin_cp_update
  ON public.financeiro_contas_pagar
  FOR UPDATE
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

CREATE POLICY fin_cp_delete
  ON public.financeiro_contas_pagar
  FOR DELETE
  USING (empresa_id = public.current_empresa_id());

-- =============================================================================
-- RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_count(
  p_q           text DEFAULT NULL,
  p_status      text DEFAULT NULL,
  p_start_date  date DEFAULT NULL,
  p_end_date    date DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_cnt bigint;
BEGIN
  SELECT COUNT(*)
    INTO v_cnt
  FROM public.financeiro_contas_pagar cp
  WHERE cp.empresa_id = v_empresa
    AND (p_status IS NULL OR cp.status = p_status)
    AND (p_start_date IS NULL OR cp.data_vencimento >= p_start_date)
    AND (p_end_date IS NULL OR cp.data_vencimento <= p_end_date)
    AND (
      p_q IS NULL
      OR cp.descricao ILIKE '%'||p_q||'%'
      OR COALESCE(cp.documento_ref,'') ILIKE '%'||p_q||'%'
    );
  RETURN v_cnt;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_count(text, text, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_count(text, text, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_list(
  p_limit       int  DEFAULT 50,
  p_offset      int  DEFAULT 0,
  p_q           text DEFAULT NULL,
  p_status      text DEFAULT NULL,
  p_start_date  date DEFAULT NULL,
  p_end_date    date DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  fornecedor_id    uuid,
  fornecedor_nome  text,
  documento_ref    text,
  descricao        text,
  data_emissao     date,
  data_vencimento  date,
  data_pagamento   date,
  valor_total      numeric,
  valor_pago       numeric,
  saldo            numeric,
  status           text,
  forma_pagamento  text,
  total_count      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.fornecedor_id,
    f.nome AS fornecedor_nome,
    cp.documento_ref,
    cp.descricao,
    cp.data_emissao,
    cp.data_vencimento,
    cp.data_pagamento,
    cp.valor_total,
    cp.valor_pago,
    (cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago AS saldo,
    cp.status,
    cp.forma_pagamento,
    COUNT(*) OVER() AS total_count
  FROM public.financeiro_contas_pagar cp
  LEFT JOIN public.pessoas f ON f.id = cp.fornecedor_id
  WHERE cp.empresa_id = v_empresa
    AND (p_status IS NULL OR cp.status = p_status)
    AND (p_start_date IS NULL OR cp.data_vencimento >= p_start_date)
    AND (p_end_date IS NULL OR cp.data_vencimento <= p_end_date)
    AND (
      p_q IS NULL
      OR cp.descricao ILIKE '%'||p_q||'%'
      OR COALESCE(cp.documento_ref,'') ILIKE '%'||p_q||'%'
      OR COALESCE(f.nome,'') ILIKE '%'||p_q||'%'
    )
  ORDER BY
    (cp.status IN ('aberta','parcial')) DESC,
    cp.data_vencimento ASC NULLS LAST,
    cp.created_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_list(int, int, text, text, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_list(int, int, text, text, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_res jsonb;
BEGIN
  SELECT
    to_jsonb(cp.*)
    || jsonb_build_object(
         'fornecedor_nome', f.nome,
         'saldo', (cp.valor_total + cp.multa + cp.juros - cp.desconto) - cp.valor_pago
       )
  INTO v_res
  FROM public.financeiro_contas_pagar cp
  LEFT JOIN public.pessoas f ON f.id = cp.fornecedor_id
  WHERE cp.id = p_id
    AND cp.empresa_id = v_empresa;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_status text := COALESCE(NULLIF(p_payload->>'status',''), 'aberta');
  v_row public.financeiro_contas_pagar;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[RPC][FIN_CP][UPSERT] empresa_id inválido' USING errcode='42501';
  END IF;

  -- status automático (parcial/paga) pode ser deduzido pelo valor_pago
  IF v_status NOT IN ('aberta','parcial','paga','cancelada') THEN
    v_status := 'aberta';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.financeiro_contas_pagar (
      empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento, data_pagamento,
      valor_total, valor_pago, multa, juros, desconto,
      forma_pagamento, centro_custo, categoria, status, observacoes
    )
    VALUES (
      v_empresa,
      NULLIF(p_payload->>'fornecedor_id','')::uuid,
      NULLIF(p_payload->>'documento_ref',''),
      NULLIF(p_payload->>'descricao',''),
      NULLIF(p_payload->>'data_emissao','')::date,
      NULLIF(p_payload->>'data_vencimento','')::date,
      NULLIF(p_payload->>'data_pagamento','')::date,
      COALESCE(NULLIF(p_payload->>'valor_total','')::numeric, 0),
      COALESCE(NULLIF(p_payload->>'valor_pago','')::numeric, 0),
      COALESCE(NULLIF(p_payload->>'multa','')::numeric, 0),
      COALESCE(NULLIF(p_payload->>'juros','')::numeric, 0),
      COALESCE(NULLIF(p_payload->>'desconto','')::numeric, 0),
      NULLIF(p_payload->>'forma_pagamento',''),
      NULLIF(p_payload->>'centro_custo',''),
      NULLIF(p_payload->>'categoria',''),
      v_status,
      NULLIF(p_payload->>'observacoes','')
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.financeiro_contas_pagar cp
       SET fornecedor_id    = CASE WHEN p_payload ? 'fornecedor_id' THEN NULLIF(p_payload->>'fornecedor_id','')::uuid ELSE cp.fornecedor_id END,
           documento_ref    = CASE WHEN p_payload ? 'documento_ref' THEN NULLIF(p_payload->>'documento_ref','') ELSE cp.documento_ref END,
           descricao        = CASE WHEN p_payload ? 'descricao' THEN NULLIF(p_payload->>'descricao','') ELSE cp.descricao END,
           data_emissao     = CASE WHEN p_payload ? 'data_emissao' THEN NULLIF(p_payload->>'data_emissao','')::date ELSE cp.data_emissao END,
           data_vencimento  = COALESCE(NULLIF(p_payload->>'data_vencimento','')::date, cp.data_vencimento),
           data_pagamento   = CASE WHEN p_payload ? 'data_pagamento' THEN NULLIF(p_payload->>'data_pagamento','')::date ELSE cp.data_pagamento END,
           valor_total      = COALESCE(NULLIF(p_payload->>'valor_total','')::numeric, cp.valor_total),
           valor_pago       = COALESCE(NULLIF(p_payload->>'valor_pago','')::numeric, cp.valor_pago),
           multa            = COALESCE(NULLIF(p_payload->>'multa','')::numeric, cp.multa),
           juros            = COALESCE(NULLIF(p_payload->>'juros','')::numeric, cp.juros),
           desconto         = COALESCE(NULLIF(p_payload->>'desconto','')::numeric, cp.desconto),
           forma_pagamento  = CASE WHEN p_payload ? 'forma_pagamento' THEN NULLIF(p_payload->>'forma_pagamento','') ELSE cp.forma_pagamento END,
           centro_custo     = CASE WHEN p_payload ? 'centro_custo' THEN NULLIF(p_payload->>'centro_custo','') ELSE cp.centro_custo END,
           categoria        = CASE WHEN p_payload ? 'categoria' THEN NULLIF(p_payload->>'categoria','') ELSE cp.categoria END,
           status           = v_status,
           observacoes      = CASE WHEN p_payload ? 'observacoes' THEN NULLIF(p_payload->>'observacoes','') ELSE cp.observacoes END,
           updated_at       = now()
     WHERE cp.id = v_id
       AND cp.empresa_id = v_empresa
    RETURNING * INTO v_row;
  END IF;

  RETURN to_jsonb(v_row)
    || jsonb_build_object('saldo', (v_row.valor_total + v_row.multa + v_row.juros - v_row.desconto) - v_row.valor_pago);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_upsert(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  DELETE FROM public.financeiro_contas_pagar cp
  WHERE cp.id = p_id
    AND cp.empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_delete(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_pagar_summary(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_abertas int;
  v_parciais int;
  v_pagas int;
  v_vencidas int;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN status='aberta' THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN status='parcial' THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN status='paga' THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN status IN ('aberta','parcial') AND data_vencimento < current_date THEN 1 ELSE 0 END),0)
  INTO v_abertas, v_parciais, v_pagas, v_vencidas
  FROM public.financeiro_contas_pagar cp
  WHERE cp.empresa_id = v_empresa
    AND (p_start_date IS NULL OR cp.data_vencimento >= p_start_date)
    AND (p_end_date IS NULL OR cp.data_vencimento <= p_end_date)
    AND cp.status <> 'cancelada';

  RETURN jsonb_build_object(
    'abertas', v_abertas,
    'parciais', v_parciais,
    'pagas', v_pagas,
    'vencidas', v_vencidas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_pagar_summary(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_pagar_summary(date, date) TO authenticated, service_role;

COMMIT;

