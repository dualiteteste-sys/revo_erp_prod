-- DASH-01: Painel de vendas (KPIs + filtros) — RPC agregada para evitar múltiplas queries no app

BEGIN;

-- Garantir permissão (idempotente)
INSERT INTO public.permissions(module, action)
VALUES ('vendas','view')
ON CONFLICT (module, action) DO NOTHING;

-- OWNER/ADMIN: sempre liberado
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON p.module = 'vendas' AND p.action = 'view'
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- FINANCE/VIEWER/MEMBER/OPS: view (mvp)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON p.module = 'vendas' AND p.action = 'view'
WHERE r.slug IN ('FINANCE','VIEWER','MEMBER','OPS')
ON CONFLICT DO NOTHING;

DROP FUNCTION IF EXISTS public.vendas_dashboard_stats(date, date, text, uuid);

CREATE OR REPLACE FUNCTION public.vendas_dashboard_stats(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_canal text DEFAULT NULL,          -- 'erp' | 'pdv' | NULL (todos)
  p_vendedor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_start date := COALESCE(p_start_date, (current_date - 30));
  v_end   date := COALESCE(p_end_date, current_date);
  v_group text;
  v_faturamento numeric := 0;
  v_pedidos_concluidos int := 0;
  v_clientes_ativos int := 0;
  v_ticket_medio numeric := 0;
  v_series jsonb := '[]'::jsonb;
  v_status jsonb := '[]'::jsonb;
  v_top_vendedores jsonb := '[]'::jsonb;
  v_top_produtos jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas','view');

  IF v_start > v_end THEN
    v_start := v_end;
  END IF;

  v_group := CASE WHEN (v_end - v_start) <= 31 THEN 'day' ELSE 'month' END;

  -- KPIs (considera somente concluídos como faturamento)
  SELECT
    COALESCE(SUM(p.total_geral),0),
    COUNT(*),
    COALESCE(COUNT(DISTINCT p.cliente_id),0)
  INTO v_faturamento, v_pedidos_concluidos, v_clientes_ativos
  FROM public.vendas_pedidos p
  WHERE p.empresa_id = v_empresa
    AND p.data_emissao BETWEEN v_start AND v_end
    AND p.status = 'concluido'
    AND (p_canal IS NULL OR p.canal = p_canal)
    AND (p_vendedor_id IS NULL OR p.vendedor_id = p_vendedor_id);

  v_ticket_medio := CASE WHEN v_pedidos_concluidos > 0 THEN (v_faturamento / v_pedidos_concluidos) ELSE 0 END;

  -- Status (todos os pedidos no período, exceto filtros opcionais)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('status', status, 'count', total)
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_status
  FROM (
    SELECT p.status, COUNT(*)::int AS total
    FROM public.vendas_pedidos p
    WHERE p.empresa_id = v_empresa
      AND p.data_emissao BETWEEN v_start AND v_end
      AND (p_canal IS NULL OR p.canal = p_canal)
      AND (p_vendedor_id IS NULL OR p.vendedor_id = p_vendedor_id)
    GROUP BY p.status
  ) s;

  -- Série temporal (concluídos)
  IF v_group = 'day' THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'label', to_char(dia, 'DD/MM'),
          'date', dia,
          'total', total
        )
        ORDER BY dia
      ),
      '[]'::jsonb
    )
    INTO v_series
    FROM (
      SELECT
        date_trunc('day', p.data_emissao::timestamptz)::date AS dia,
        COALESCE(SUM(p.total_geral),0)::numeric AS total
      FROM public.vendas_pedidos p
      WHERE p.empresa_id = v_empresa
        AND p.data_emissao BETWEEN v_start AND v_end
        AND p.status = 'concluido'
        AND (p_canal IS NULL OR p.canal = p_canal)
        AND (p_vendedor_id IS NULL OR p.vendedor_id = p_vendedor_id)
      GROUP BY 1
    ) x;
  ELSE
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'label', to_char(mes, 'MM/YYYY'),
          'month', mes,
          'total', total
        )
        ORDER BY mes
      ),
      '[]'::jsonb
    )
    INTO v_series
    FROM (
      SELECT
        date_trunc('month', p.data_emissao::timestamptz)::date AS mes,
        COALESCE(SUM(p.total_geral),0)::numeric AS total
      FROM public.vendas_pedidos p
      WHERE p.empresa_id = v_empresa
        AND p.data_emissao BETWEEN v_start AND v_end
        AND p.status = 'concluido'
        AND (p_canal IS NULL OR p.canal = p_canal)
        AND (p_vendedor_id IS NULL OR p.vendedor_id = p_vendedor_id)
      GROUP BY 1
    ) x;
  END IF;

  -- Top vendedores (concluídos)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'vendedor_id', vendedor_id,
        'nome', nome,
        'total', total
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_vendedores
  FROM (
    SELECT
      p.vendedor_id,
      COALESCE(v.nome, '—') AS nome,
      COALESCE(SUM(p.total_geral),0)::numeric AS total
    FROM public.vendas_pedidos p
    LEFT JOIN public.vendedores v
      ON v.id = p.vendedor_id
     AND v.empresa_id = v_empresa
    WHERE p.empresa_id = v_empresa
      AND p.data_emissao BETWEEN v_start AND v_end
      AND p.status = 'concluido'
      AND p.vendedor_id IS NOT NULL
      AND (p_canal IS NULL OR p.canal = p_canal)
      AND (p_vendedor_id IS NULL OR p.vendedor_id = p_vendedor_id)
    GROUP BY 1,2
    LIMIT 5
  ) x;

  -- Top produtos (concluídos)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'produto_id', produto_id,
        'nome', nome,
        'quantidade', quantidade,
        'total', total
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_produtos
  FROM (
    SELECT
      i.produto_id,
      COALESCE(pr.nome, '—') AS nome,
      COALESCE(SUM(i.quantidade),0)::numeric AS quantidade,
      COALESCE(SUM(i.total),0)::numeric AS total
    FROM public.vendas_itens_pedido i
    JOIN public.vendas_pedidos p
      ON p.id = i.pedido_id
     AND p.empresa_id = v_empresa
    LEFT JOIN public.produtos pr
      ON pr.id = i.produto_id
     AND pr.empresa_id = v_empresa
    WHERE i.empresa_id = v_empresa
      AND p.data_emissao BETWEEN v_start AND v_end
      AND p.status = 'concluido'
      AND (p_canal IS NULL OR p.canal = p_canal)
      AND (p_vendedor_id IS NULL OR p.vendedor_id = p_vendedor_id)
    GROUP BY 1,2
    LIMIT 5
  ) x;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', v_start, 'end', v_end, 'group', v_group),
    'kpis', jsonb_build_object(
      'faturamento_total', v_faturamento,
      'ticket_medio', v_ticket_medio,
      'pedidos_concluidos', v_pedidos_concluidos,
      'clientes_ativos', v_clientes_ativos
    ),
    'status', v_status,
    'series', v_series,
    'top_vendedores', v_top_vendedores,
    'top_produtos', v_top_produtos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_dashboard_stats(date, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_dashboard_stats(date, date, text, uuid) TO authenticated, service_role;

COMMIT;
