-- Financeiro → Extrato bancário: espelho do extrato importado
-- - Preserva ordem do arquivo (sequencia_importacao)
-- - Deduplica por hash_importacao quando disponível (idempotência sem perder linhas iguais no mesmo arquivo)
-- - Calcula saldo por linha quando saldo_apos_lancamento não existir

-- 1) Schema: ordem estável por importação
ALTER TABLE public.financeiro_extratos_bancarios
  ADD COLUMN IF NOT EXISTS sequencia_importacao integer;

-- Backfill determinístico para registros antigos (não recupera a ordem original, mas evita ORDER BY UUID).
WITH ranked AS (
  SELECT
    e.id,
    ROW_NUMBER() OVER (
      PARTITION BY e.empresa_id, e.conta_corrente_id, e.data_lancamento
      ORDER BY e.created_at ASC, e.id ASC
    ) AS rn
  FROM public.financeiro_extratos_bancarios e
  WHERE e.sequencia_importacao IS NULL
)
UPDATE public.financeiro_extratos_bancarios e
SET sequencia_importacao = r.rn
FROM ranked r
WHERE r.id = e.id;

ALTER TABLE public.financeiro_extratos_bancarios
  ALTER COLUMN sequencia_importacao SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_extrato_empresa_cc_data_seq
  ON public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, data_lancamento, sequencia_importacao);

-- 2) RPC: importar preservando ordem + saldo (quando existir) e dedupe idempotente por hash
CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_importar(
  p_conta_corrente_id uuid,
  p_itens jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_item jsonb;
  v_count integer := 0;
  v_data date;
  v_desc text;
  v_doc text;
  v_tipo text;
  v_valor numeric;
  v_saldo numeric;
  v_id_banco text;
  v_hash text;
  v_linha text;
  v_seq int;
BEGIN
  IF jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens deve ser um array JSON.';
  END IF;

  PERFORM public.require_permission_for_current_user('tesouraria','manage');

  IF NOT EXISTS (
    SELECT 1 FROM public.financeiro_contas_correntes cc
    WHERE cc.id = p_conta_corrente_id
      AND cc.empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta corrente não encontrada ou acesso negado.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_data     := (v_item->>'data_lancamento')::date;
    v_desc     := v_item->>'descricao';
    v_doc      := v_item->>'documento_ref';
    v_tipo     := COALESCE(v_item->>'tipo_lancamento', 'credito');
    v_valor    := (v_item->>'valor')::numeric;
    v_saldo    := (v_item->>'saldo_apos_lancamento')::numeric;
    v_id_banco := v_item->>'identificador_banco';
    v_hash     := v_item->>'hash_importacao';
    v_linha    := v_item->>'linha_bruta';
    v_seq      := NULLIF((v_item->>'sequencia_importacao')::int, 0);

    IF v_data IS NULL OR v_valor IS NULL OR v_valor <= 0 THEN
      CONTINUE;
    END IF;

    IF v_tipo NOT IN ('credito','debito') THEN
      v_tipo := 'credito';
    END IF;

    -- Ordem mínima: mantém a ordem original quando enviada; fallback para a ordem do array.
    v_seq := COALESCE(v_seq, v_count + 1);

    -- Idempotência sem falsos-positivos:
    -- 1) Se veio hash_importacao, ele é a chave de dedupe (o frontend inclui o "line" para permitir linhas iguais no mesmo arquivo).
    -- 2) Senão, tenta identificador_banco (ex.: FITID OFX).
    -- 3) Por último, fallback conservador.
    IF v_hash IS NOT NULL AND v_hash <> '' THEN
      IF EXISTS (
        SELECT 1
        FROM public.financeiro_extratos_bancarios e
        WHERE e.empresa_id = v_empresa
          AND e.conta_corrente_id = p_conta_corrente_id
          AND e.hash_importacao = v_hash
      ) THEN
        CONTINUE;
      END IF;
    ELSIF v_id_banco IS NOT NULL AND v_id_banco <> '' THEN
      IF EXISTS (
        SELECT 1
        FROM public.financeiro_extratos_bancarios e
        WHERE e.empresa_id = v_empresa
          AND e.conta_corrente_id = p_conta_corrente_id
          AND e.identificador_banco = v_id_banco
      ) THEN
        CONTINUE;
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.financeiro_extratos_bancarios e
        WHERE e.empresa_id = v_empresa
          AND e.conta_corrente_id = p_conta_corrente_id
          AND e.data_lancamento = v_data
          AND e.valor = v_valor
          AND COALESCE(e.documento_ref,'') = COALESCE(v_doc,'')
          AND COALESCE(e.descricao,'') = COALESCE(v_desc,'')
      ) THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.financeiro_extratos_bancarios (
      empresa_id,
      conta_corrente_id,
      data_lancamento,
      descricao,
      identificador_banco,
      documento_ref,
      tipo_lancamento,
      valor,
      saldo_apos_lancamento,
      origem_importacao,
      hash_importacao,
      linha_bruta,
      sequencia_importacao,
      conciliado
    ) VALUES (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      NULLIF(v_id_banco,''),
      NULLIF(v_doc,''),
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      NULLIF(v_hash,''),
      v_linha,
      v_seq,
      false
    );

    v_count := v_count + 1;
  END LOOP;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_importar: conta=' || p_conta_corrente_id || ' qtd=' || v_count);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_importar(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_importar(uuid, jsonb) TO authenticated, service_role;

-- 3) RPC: listar como espelho (saldo por linha calculado quando necessário + ordem estável)
DROP FUNCTION IF EXISTS public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer);

CREATE FUNCTION public.financeiro_extrato_bancario_list(
  p_conta_corrente_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_tipo_lancamento text DEFAULT NULL,
  p_conciliado boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  conta_corrente_id uuid,
  conta_nome text,
  data_lancamento date,
  descricao text,
  documento_ref text,
  tipo_lancamento text,
  valor numeric,
  saldo_apos_lancamento numeric,
  conciliado boolean,
  movimentacao_id uuid,
  movimentacao_data date,
  movimentacao_tipo text,
  movimentacao_descricao text,
  movimentacao_valor numeric,
  sequencia_importacao integer,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  IF p_tipo_lancamento IS NOT NULL AND p_tipo_lancamento NOT IN ('credito','debito') THEN
    RAISE EXCEPTION 'p_tipo_lancamento inválido. Use credito, debito ou null.';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      e.id,
      e.conta_corrente_id,
      cc.nome AS conta_nome,
      e.data_lancamento,
      e.descricao,
      e.documento_ref,
      e.tipo_lancamento,
      e.valor,
      e.saldo_apos_lancamento,
      e.conciliado,
      e.movimentacao_id,
      m.data_movimento AS movimentacao_data,
      m.tipo_mov       AS movimentacao_tipo,
      m.descricao      AS movimentacao_descricao,
      m.valor          AS movimentacao_valor,
      e.sequencia_importacao,
      (CASE WHEN e.tipo_lancamento = 'credito' THEN e.valor ELSE -e.valor END) AS delta
    FROM public.financeiro_extratos_bancarios e
    JOIN public.financeiro_contas_correntes cc
      ON cc.id = e.conta_corrente_id
     AND cc.empresa_id = v_empresa
    LEFT JOIN public.financeiro_movimentacoes m
      ON m.id = e.movimentacao_id
     AND m.empresa_id = v_empresa
    WHERE e.empresa_id = v_empresa
      AND (p_conta_corrente_id IS NULL OR e.conta_corrente_id = p_conta_corrente_id)
      AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
      AND (p_end_date   IS NULL OR e.data_lancamento <= p_end_date)
      AND (p_conciliado IS NULL OR e.conciliado = p_conciliado)
      AND (p_tipo_lancamento IS NULL OR e.tipo_lancamento = p_tipo_lancamento)
      AND (
        p_q IS NULL
        OR e.descricao ILIKE '%'||p_q||'%'
        OR COALESCE(e.documento_ref,'') ILIKE '%'||p_q||'%'
        OR COALESCE(e.identificador_banco,'') ILIKE '%'||p_q||'%'
      )
  ),
  min_date AS (
    SELECT conta_corrente_id, MIN(data_lancamento) AS min_data
    FROM filtered
    GROUP BY conta_corrente_id
  ),
  base AS (
    SELECT
      md.conta_corrente_id,
      md.min_data,
      COALESCE(
        (
          SELECT eprev.saldo_apos_lancamento
          FROM public.financeiro_extratos_bancarios eprev
          WHERE eprev.empresa_id = v_empresa
            AND eprev.conta_corrente_id = md.conta_corrente_id
            AND eprev.saldo_apos_lancamento IS NOT NULL
            AND eprev.data_lancamento < md.min_data
          ORDER BY eprev.data_lancamento DESC, eprev.sequencia_importacao DESC, eprev.id DESC
          LIMIT 1
        ),
        (
          SELECT
            CASE
              WHEN cc.data_saldo_inicial IS NULL OR cc.data_saldo_inicial <= md.min_data THEN cc.saldo_inicial
              ELSE NULL
            END
          FROM public.financeiro_contas_correntes cc
          WHERE cc.empresa_id = v_empresa
            AND cc.id = md.conta_corrente_id
        )
      ) AS base_balance
    FROM min_date md
  ),
  grp AS (
    SELECT
      f.*,
      COUNT(*) OVER() AS total_count,
      SUM(CASE WHEN f.saldo_apos_lancamento IS NOT NULL THEN 1 ELSE 0 END)
        OVER (PARTITION BY f.conta_corrente_id ORDER BY f.data_lancamento, f.sequencia_importacao, f.id) AS grp,
      SUM(f.delta) OVER (PARTITION BY f.conta_corrente_id ORDER BY f.data_lancamento, f.sequencia_importacao, f.id) AS cum_delta_total
    FROM filtered f
  )
  , ordered AS (
    SELECT
      g.*,
      SUM(g.delta) OVER (PARTITION BY g.conta_corrente_id, g.grp ORDER BY g.data_lancamento, g.sequencia_importacao, g.id) AS cum_delta_grp,
      FIRST_VALUE(g.delta) OVER (PARTITION BY g.conta_corrente_id, g.grp ORDER BY g.data_lancamento, g.sequencia_importacao, g.id) AS anchor_delta,
      FIRST_VALUE(g.saldo_apos_lancamento) OVER (PARTITION BY g.conta_corrente_id, g.grp ORDER BY g.data_lancamento, g.sequencia_importacao, g.id) AS anchor_balance
    FROM grp g
  )
  SELECT
    o.id,
    o.conta_corrente_id,
    o.conta_nome,
    o.data_lancamento,
    o.descricao,
    o.documento_ref,
    o.tipo_lancamento,
    o.valor,
    COALESCE(
      o.saldo_apos_lancamento,
      CASE
        WHEN o.grp = 0 THEN (b.base_balance + o.cum_delta_total)
        ELSE (o.anchor_balance + (o.cum_delta_grp - o.anchor_delta))
      END
    ) AS saldo_apos_lancamento,
    o.conciliado,
    o.movimentacao_id,
    o.movimentacao_data,
    o.movimentacao_tipo,
    o.movimentacao_descricao,
    o.movimentacao_valor,
    o.sequencia_importacao,
    o.total_count
  FROM ordered o
  LEFT JOIN base b
    ON b.conta_corrente_id = o.conta_corrente_id
  ORDER BY o.data_lancamento ASC, o.sequencia_importacao ASC, o.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_extrato_bancario_list(uuid, date, date, text, boolean, text, integer, integer) TO authenticated, service_role;
