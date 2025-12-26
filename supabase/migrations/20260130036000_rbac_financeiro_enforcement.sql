/*
  RBAC enforcement (Financeiro + Centros de Custo)

  Objetivo:
  - Evitar burla via console (RPCs SECURITY DEFINER precisam validar permissões do usuário autenticado).
  - Adicionar permissões que faltavam para o Financeiro (Contas a Pagar, Tesouraria, Relatórios).

  Observação:
  - OWNER/ADMIN continuam com acesso total (seed incremental).
  - MEMBER/OPS/VIEWER recebem permissões de "view" para não quebrar telas/relatórios de leitura.
*/

BEGIN;

-- 1) Helper: falha com mensagem amigável (PT-BR) e errcode de autorização.
CREATE OR REPLACE FUNCTION public.require_permission_for_current_user(p_module text, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_permission_for_current_user(p_module, p_action) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para %/% nesta empresa.', p_module, p_action
      USING errcode = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.require_permission_for_current_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.require_permission_for_current_user(text, text) TO authenticated, service_role;

-- 2) Novas permissões do Financeiro
INSERT INTO public.permissions(module, action) VALUES
  ('contas_a_pagar','view'),('contas_a_pagar','create'),('contas_a_pagar','update'),('contas_a_pagar','delete'),
  ('tesouraria','view'),('tesouraria','create'),('tesouraria','update'),('tesouraria','delete'),('tesouraria','manage'),
  ('relatorios_financeiro','view')
ON CONFLICT (module, action) DO NOTHING;

-- 3) Seeds incrementais (role_permissions) para permissões recém-criadas

-- OWNER/ADMIN: tudo permitido
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON true
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- MEMBER: leitura de módulos financeiros do MVP
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module IN ('contas_a_receber','contas_a_pagar','tesouraria','relatorios_financeiro') AND p.action = 'view')
  )
WHERE r.slug = 'MEMBER'
ON CONFLICT DO NOTHING;

-- OPS: leitura de módulos financeiros do MVP
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module IN ('contas_a_receber','contas_a_pagar','tesouraria','relatorios_financeiro') AND p.action = 'view')
  )
WHERE r.slug = 'OPS'
ON CONFLICT DO NOTHING;

-- FINANCE: gestão do financeiro (MVP)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module IN ('contas_a_receber','contas_a_pagar') AND p.action IN ('view','create','update'))
    OR (p.module = 'tesouraria' AND p.action IN ('view','create','update','manage'))
    OR (p.module = 'relatorios_financeiro' AND p.action = 'view')
  )
WHERE r.slug = 'FINANCE'
ON CONFLICT DO NOTHING;

-- VIEWER: leitura do financeiro
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module IN ('contas_a_receber','contas_a_pagar','tesouraria','relatorios_financeiro') AND p.action = 'view')
  )
WHERE r.slug = 'VIEWER'
ON CONFLICT DO NOTHING;

-- 4) Enforcement nas RPCs (Financeiro / Centros de Custo)

-- Contas a Receber
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
  PERFORM public.require_permission_for_current_user('contas_a_receber','view');

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
GRANT EXECUTE ON FUNCTION public.count_contas_a_receber(text, public.status_conta_receber) TO authenticated, service_role;

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
  PERFORM public.require_permission_for_current_user('contas_a_receber','view');

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
GRANT EXECUTE ON FUNCTION public.list_contas_a_receber(int,int,text,public.status_conta_receber,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_conta_a_receber_details(p_id uuid)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rec public.contas_a_receber;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','view');

  SELECT * INTO rec
  FROM public.contas_a_receber
  WHERE id = p_id AND empresa_id = public.current_empresa_id();

  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.get_conta_a_receber_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_conta_a_receber_details(uuid) TO authenticated, service_role;

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
    PERFORM public.require_permission_for_current_user('contas_a_receber','create');
  ELSE
    PERFORM public.require_permission_for_current_user('contas_a_receber','update');
  END IF;

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
GRANT EXECUTE ON FUNCTION public.create_update_conta_a_receber(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_conta_a_receber(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','delete');

  DELETE FROM public.contas_a_receber
  WHERE id = p_id AND empresa_id = public.current_empresa_id();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_conta_a_receber(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_conta_a_receber(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_contas_a_receber_summary()
RETURNS TABLE(total_pendente numeric, total_pago_mes numeric, total_vencido numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','view');

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
GRANT EXECUTE ON FUNCTION public.get_contas_a_receber_summary() TO authenticated, service_role;

-- Contas a Pagar
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
  PERFORM public.require_permission_for_current_user('contas_a_pagar','view');

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
  PERFORM public.require_permission_for_current_user('contas_a_pagar','view');

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
  PERFORM public.require_permission_for_current_user('contas_a_pagar','view');

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
  IF v_id IS NULL THEN
    PERFORM public.require_permission_for_current_user('contas_a_pagar','create');
  ELSE
    PERFORM public.require_permission_for_current_user('contas_a_pagar','update');
  END IF;

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
  PERFORM public.require_permission_for_current_user('contas_a_pagar','delete');

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
  PERFORM public.require_permission_for_current_user('contas_a_pagar','view');

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

-- Tesouraria (Contas Correntes / Movimentações / Extratos)
CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_list(
  p_search text DEFAULT NULL,
  p_ativo boolean DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  nome text,
  apelido text,
  banco_codigo text,
  banco_nome text,
  agencia text,
  conta text,
  tipo_conta text,
  moeda text,
  saldo_atual numeric,
  ativo boolean,
  padrao_para_pagamentos boolean,
  padrao_para_recebimentos boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  RETURN QUERY
  SELECT
    cc.id,
    cc.nome,
    cc.apelido,
    cc.banco_codigo,
    cc.banco_nome,
    cc.agencia,
    cc.conta,
    cc.tipo_conta,
    cc.moeda,
    (
      cc.saldo_inicial
      + COALESCE((
          SELECT SUM(
                   CASE WHEN m.tipo_mov = 'entrada'
                        THEN m.valor
                        ELSE -m.valor
                   END
                 )
          FROM public.financeiro_movimentacoes m
          WHERE m.empresa_id = v_empresa
            AND m.conta_corrente_id = cc.id
            AND m.data_movimento <= current_date
        ), 0)
    ) AS saldo_atual,
    cc.ativo,
    cc.padrao_para_pagamentos,
    cc.padrao_para_recebimentos,
    COUNT(*) OVER() AS total_count
  FROM public.financeiro_contas_correntes cc
  WHERE cc.empresa_id = v_empresa
    AND (p_ativo IS NULL OR cc.ativo = p_ativo)
    AND (
      p_search IS NULL
      OR cc.nome ILIKE '%'||p_search||'%'
      OR COALESCE(cc.apelido,'') ILIKE '%'||p_search||'%'
      OR COALESCE(cc.banco_nome,'') ILIKE '%'||p_search||'%'
      OR COALESCE(cc.banco_codigo,'') ILIKE '%'||p_search||'%'
      OR COALESCE(cc.conta,'') ILIKE '%'||p_search||'%'
    )
  ORDER BY cc.ativo DESC, cc.nome ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_list(text, boolean, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_list(text, boolean, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_result jsonb;
  v_saldo_atual numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  SELECT
    cc.saldo_inicial
    + COALESCE((
        SELECT SUM(
                 CASE WHEN m.tipo_mov = 'entrada'
                      THEN m.valor
                      ELSE -m.valor
                 END
               )
        FROM public.financeiro_movimentacoes m
        WHERE m.empresa_id = v_empresa
          AND m.conta_corrente_id = cc.id
          AND m.data_movimento <= current_date
      ), 0)
  INTO v_saldo_atual
  FROM public.financeiro_contas_correntes cc
  WHERE cc.id = p_id
    AND cc.empresa_id = v_empresa;

  SELECT
    to_jsonb(cc.*)
    || jsonb_build_object('saldo_atual', COALESCE(v_saldo_atual, 0))
  INTO v_result
  FROM public.financeiro_contas_correntes cc
  WHERE cc.id = p_id
    AND cc.empresa_id = v_empresa;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_padrao_pag boolean;
  v_padrao_rec boolean;
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('tesouraria','create');
  ELSE
    PERFORM public.require_permission_for_current_user('tesouraria','update');
  END IF;

  v_padrao_pag := COALESCE((p_payload->>'padrao_para_pagamentos')::boolean, false);
  v_padrao_rec := COALESCE((p_payload->>'padrao_para_recebimentos')::boolean, false);

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.financeiro_contas_correntes cc
    SET
      nome                     = p_payload->>'nome',
      apelido                  = p_payload->>'apelido',
      banco_codigo             = p_payload->>'banco_codigo',
      banco_nome               = p_payload->>'banco_nome',
      agencia                  = p_payload->>'agencia',
      conta                    = p_payload->>'conta',
      digito                   = p_payload->>'digito',
      tipo_conta               = COALESCE(p_payload->>'tipo_conta', tipo_conta),
      moeda                    = COALESCE(p_payload->>'moeda', moeda),
      saldo_inicial            = COALESCE((p_payload->>'saldo_inicial')::numeric, saldo_inicial),
      data_saldo_inicial       = COALESCE((p_payload->>'data_saldo_inicial')::date, data_saldo_inicial),
      limite_credito           = COALESCE((p_payload->>'limite_credito')::numeric, limite_credito),
      permite_saldo_negativo   = COALESCE((p_payload->>'permite_saldo_negativo')::boolean, permite_saldo_negativo),
      ativo                    = COALESCE((p_payload->>'ativo')::boolean, ativo),
      padrao_para_pagamentos   = v_padrao_pag,
      padrao_para_recebimentos = v_padrao_rec,
      observacoes              = p_payload->>'observacoes'
    WHERE cc.id = (p_payload->>'id')::uuid
      AND cc.empresa_id = v_empresa
    RETURNING cc.id INTO v_id;
  ELSE
    INSERT INTO public.financeiro_contas_correntes (
      empresa_id, nome, apelido, banco_codigo, banco_nome, agencia, conta, digito, tipo_conta, moeda,
      saldo_inicial, data_saldo_inicial, limite_credito, permite_saldo_negativo, ativo,
      padrao_para_pagamentos, padrao_para_recebimentos, observacoes
    ) VALUES (
      v_empresa,
      p_payload->>'nome',
      p_payload->>'apelido',
      p_payload->>'banco_codigo',
      p_payload->>'banco_nome',
      p_payload->>'agencia',
      p_payload->>'conta',
      p_payload->>'digito',
      COALESCE(p_payload->>'tipo_conta', 'corrente'),
      COALESCE(p_payload->>'moeda', 'BRL'),
      COALESCE((p_payload->>'saldo_inicial')::numeric, 0),
      COALESCE((p_payload->>'data_saldo_inicial')::date, current_date),
      COALESCE((p_payload->>'limite_credito')::numeric, 0),
      COALESCE((p_payload->>'permite_saldo_negativo')::boolean, false),
      COALESCE((p_payload->>'ativo')::boolean, true),
      v_padrao_pag,
      v_padrao_rec,
      p_payload->>'observacoes'
    )
    RETURNING id INTO v_id;
  END IF;

  IF v_padrao_pag THEN
    UPDATE public.financeiro_contas_correntes
    SET padrao_para_pagamentos = false
    WHERE empresa_id = v_empresa
      AND id <> v_id;
  END IF;

  IF v_padrao_rec THEN
    UPDATE public.financeiro_contas_correntes
    SET padrao_para_recebimentos = false
    WHERE empresa_id = v_empresa
      AND id <> v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_contas_correntes_upsert: ' || v_id);
  RETURN public.financeiro_contas_correntes_get(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_upsert(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_has_ref boolean;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','delete');

  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_movimentacoes m
    WHERE m.empresa_id = v_empresa
      AND m.conta_corrente_id = p_id
  ) INTO v_has_ref;

  IF v_has_ref THEN
    RAISE EXCEPTION 'Conta corrente possui movimentações vinculadas. Desative a conta em vez de excluir.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_extratos_bancarios e
    WHERE e.empresa_id = v_empresa
      AND e.conta_corrente_id = p_id
  ) INTO v_has_ref;

  IF v_has_ref THEN
    RAISE EXCEPTION 'Conta corrente possui extratos vinculados. Desative a conta em vez de excluir.';
  END IF;

  DELETE FROM public.financeiro_contas_correntes
  WHERE id = p_id AND empresa_id = v_empresa;

  PERFORM pg_notify('app_log', '[RPC] financeiro_contas_correntes_delete: ' || p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_delete(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_list(
  p_conta_corrente_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_tipo_mov text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  data_movimento date,
  data_competencia date,
  tipo_mov text,
  descricao text,
  documento_ref text,
  origem_tipo text,
  origem_id uuid,
  valor_entrada numeric,
  valor_saida numeric,
  saldo_acumulado numeric,
  conciliado boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_saldo_base numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  IF p_conta_corrente_id IS NULL THEN
    RAISE EXCEPTION 'p_conta_corrente_id é obrigatório.';
  END IF;

  IF p_tipo_mov IS NOT NULL AND p_tipo_mov NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'p_tipo_mov inválido. Use entrada ou saida.';
  END IF;

  SELECT
    cc.saldo_inicial
    + COALESCE((
        SELECT SUM(
                 CASE WHEN m.tipo_mov = 'entrada'
                      THEN m.valor
                      ELSE -m.valor
                 END
               )
        FROM public.financeiro_movimentacoes m
        WHERE m.empresa_id = v_empresa
          AND m.conta_corrente_id = cc.id
          AND (p_start_date IS NOT NULL AND m.data_movimento < p_start_date)
      ), 0)
  INTO v_saldo_base
  FROM public.financeiro_contas_correntes cc
  WHERE cc.id = p_conta_corrente_id
    AND cc.empresa_id = v_empresa;

  v_saldo_base := COALESCE(v_saldo_base, 0);

  RETURN QUERY
  WITH movs AS (
    SELECT
      m.id,
      m.data_movimento,
      m.data_competencia,
      m.tipo_mov,
      m.descricao,
      m.documento_ref,
      m.origem_tipo,
      m.origem_id,
      m.valor,
      m.conciliado,
      m.created_at,
      COUNT(*) OVER() AS total_count,
      CASE WHEN m.tipo_mov = 'entrada' THEN m.valor ELSE 0 END AS val_entrada,
      CASE WHEN m.tipo_mov = 'saida'   THEN m.valor ELSE 0 END AS val_saida
    FROM public.financeiro_movimentacoes m
    WHERE m.empresa_id = v_empresa
      AND m.conta_corrente_id = p_conta_corrente_id
      AND (p_start_date IS NULL OR m.data_movimento >= p_start_date)
      AND (p_end_date IS NULL OR m.data_movimento <= p_end_date)
      AND (p_tipo_mov IS NULL OR m.tipo_mov = p_tipo_mov)
      AND (
        p_q IS NULL
        OR m.descricao ILIKE '%'||p_q||'%'
        OR COALESCE(m.documento_ref,'') ILIKE '%'||p_q||'%'
        OR COALESCE(m.origem_tipo,'') ILIKE '%'||p_q||'%'
      )
  )
  SELECT
    mv.id,
    mv.data_movimento,
    mv.data_competencia,
    mv.tipo_mov,
    mv.descricao,
    mv.documento_ref,
    mv.origem_tipo,
    mv.origem_id,
    mv.val_entrada AS valor_entrada,
    mv.val_saida AS valor_saida,
    v_saldo_base
      + SUM(
          CASE WHEN mv.tipo_mov = 'entrada' THEN mv.valor ELSE -mv.valor END
        ) OVER (ORDER BY mv.data_movimento ASC, mv.created_at ASC, mv.id ASC) AS saldo_acumulado,
    mv.conciliado,
    mv.total_count
  FROM movs mv
  ORDER BY mv.data_movimento ASC, mv.created_at ASC, mv.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_list(uuid, date, date, text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_list(uuid, date, date, text, text, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_result jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  SELECT
    to_jsonb(m.*) || jsonb_build_object('conta_nome', cc.nome)
  INTO v_result
  FROM public.financeiro_movimentacoes m
  JOIN public.financeiro_contas_correntes cc
    ON cc.id = m.conta_corrente_id
   AND cc.empresa_id = v_empresa
  WHERE m.id = p_id
    AND m.empresa_id = v_empresa;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_tipo text;
  v_valor numeric;
  v_cc_id uuid;
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('tesouraria','create');
  ELSE
    PERFORM public.require_permission_for_current_user('tesouraria','update');
  END IF;

  v_tipo := COALESCE(p_payload->>'tipo_mov', 'entrada');
  v_valor := (p_payload->>'valor')::numeric;
  v_cc_id := (p_payload->>'conta_corrente_id')::uuid;

  IF v_cc_id IS NULL THEN
    RAISE EXCEPTION 'conta_corrente_id é obrigatório.';
  END IF;
  IF v_tipo NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'tipo_mov inválido.';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'valor inválido.';
  END IF;

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.financeiro_movimentacoes m
    SET
      conta_corrente_id = v_cc_id,
      data_movimento    = COALESCE((p_payload->>'data_movimento')::date, data_movimento),
      data_competencia  = (p_payload->>'data_competencia')::date,
      tipo_mov          = v_tipo,
      valor             = v_valor,
      descricao         = p_payload->>'descricao',
      documento_ref     = p_payload->>'documento_ref',
      origem_tipo       = p_payload->>'origem_tipo',
      origem_id         = NULLIF(p_payload->>'origem_id','')::uuid,
      categoria         = p_payload->>'categoria',
      centro_custo      = p_payload->>'centro_custo',
      observacoes       = p_payload->>'observacoes'
    WHERE m.id = (p_payload->>'id')::uuid
      AND m.empresa_id = v_empresa
    RETURNING m.id INTO v_id;
  ELSE
    INSERT INTO public.financeiro_movimentacoes (
      empresa_id, conta_corrente_id, data_movimento, data_competencia, tipo_mov, valor,
      descricao, documento_ref, origem_tipo, origem_id, categoria, centro_custo, conciliado, observacoes
    ) VALUES (
      v_empresa,
      v_cc_id,
      COALESCE((p_payload->>'data_movimento')::date, current_date),
      (p_payload->>'data_competencia')::date,
      v_tipo,
      v_valor,
      p_payload->>'descricao',
      p_payload->>'documento_ref',
      p_payload->>'origem_tipo',
      NULLIF(p_payload->>'origem_id','')::uuid,
      p_payload->>'categoria',
      p_payload->>'centro_custo',
      COALESCE((p_payload->>'conciliado')::boolean, false),
      p_payload->>'observacoes'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_movimentacoes_upsert: ' || v_id);
  RETURN public.financeiro_movimentacoes_get(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_upsert(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_movimentacoes_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','delete');

  DELETE FROM public.financeiro_movimentacoes m
  WHERE m.id = p_id
    AND m.empresa_id = v_empresa;

  PERFORM pg_notify('app_log', '[RPC] financeiro_movimentacoes_delete: ' || p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_movimentacoes_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_movimentacoes_delete(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_list(
  p_conta_corrente_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_conciliado boolean DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  data_lancamento date,
  descricao text,
  documento_ref text,
  tipo_lancamento text,
  valor numeric,
  saldo_apos_lancamento numeric,
  conciliado boolean,
  movimentacao_id uuid,
  movimentacao_data date,
  movimentacao_descricao text,
  movimentacao_valor numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  IF p_conta_corrente_id IS NULL THEN
    RAISE EXCEPTION 'p_conta_corrente_id é obrigatório.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.data_lancamento,
    e.descricao,
    e.documento_ref,
    e.tipo_lancamento,
    e.valor,
    e.saldo_apos_lancamento,
    e.conciliado,
    e.movimentacao_id,
    m.data_movimento AS movimentacao_data,
    m.descricao AS movimentacao_descricao,
    m.valor AS movimentacao_valor,
    COUNT(*) OVER() AS total_count
  FROM public.financeiro_extratos_bancarios e
  LEFT JOIN public.financeiro_movimentacoes m
    ON m.id = e.movimentacao_id
   AND m.empresa_id = v_empresa
  WHERE e.empresa_id = v_empresa
    AND e.conta_corrente_id = p_conta_corrente_id
    AND (p_start_date IS NULL OR e.data_lancamento >= p_start_date)
    AND (p_end_date IS NULL OR e.data_lancamento <= p_end_date)
    AND (p_conciliado IS NULL OR e.conciliado = p_conciliado)
    AND (
      p_q IS NULL
      OR e.descricao ILIKE '%'||p_q||'%'
      OR COALESCE(e.documento_ref,'') ILIKE '%'||p_q||'%'
    )
  ORDER BY e.data_lancamento ASC, e.created_at ASC, e.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_list(uuid, date, date, boolean, text, int, int) TO authenticated, service_role;

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
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','manage');

  IF jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens deve ser um array JSON.';
  END IF;

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

    IF v_data IS NULL OR v_valor IS NULL OR v_valor <= 0 THEN
      CONTINUE;
    END IF;

    IF v_tipo NOT IN ('credito','debito') THEN
      v_tipo := 'credito';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.financeiro_extratos_bancarios e
      WHERE e.empresa_id = v_empresa
        AND e.conta_corrente_id = p_conta_corrente_id
        AND e.data_lancamento = v_data
        AND e.valor = v_valor
        AND COALESCE(e.identificador_banco,'') = COALESCE(v_id_banco,'')
        AND COALESCE(e.documento_ref,'') = COALESCE(v_doc,'')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.financeiro_extratos_bancarios (
      empresa_id, conta_corrente_id, data_lancamento, descricao, identificador_banco, documento_ref,
      tipo_lancamento, valor, saldo_apos_lancamento, origem_importacao, hash_importacao, linha_bruta, conciliado
    ) VALUES (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      v_id_banco,
      v_doc,
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      v_hash,
      v_linha,
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

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_vincular_movimentacao(
  p_extrato_id uuid,
  p_movimentacao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov record;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','manage');

  SELECT * INTO v_extrato
  FROM public.financeiro_extratos_bancarios e
  WHERE e.id = p_extrato_id
    AND e.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado ou acesso negado.';
  END IF;

  SELECT * INTO v_mov
  FROM public.financeiro_movimentacoes m
  WHERE m.id = p_movimentacao_id
    AND m.empresa_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada ou acesso negado.';
  END IF;

  IF v_extrato.conta_corrente_id <> v_mov.conta_corrente_id THEN
    RAISE EXCEPTION 'Conta do extrato difere da conta da movimentação.';
  END IF;

  IF v_extrato.tipo_lancamento = 'credito' AND v_mov.tipo_mov <> 'entrada' THEN
    RAISE EXCEPTION 'Lançamento de crédito só pode ser conciliado com movimentação de entrada.';
  END IF;

  IF v_extrato.tipo_lancamento = 'debito' AND v_mov.tipo_mov <> 'saida' THEN
    RAISE EXCEPTION 'Lançamento de débito só pode ser conciliado com movimentação de saída.';
  END IF;

  UPDATE public.financeiro_extratos_bancarios
  SET movimentacao_id = v_mov.id,
      conciliado = true
  WHERE id = v_extrato.id;

  UPDATE public.financeiro_movimentacoes
  SET conciliado = true
  WHERE id = v_mov.id;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_extratos_bancarios_desvincular(p_extrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_mov_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','manage');

  SELECT movimentacao_id
  INTO v_mov_id
  FROM public.financeiro_extratos_bancarios e
  WHERE e.id = p_extrato_id
    AND e.empresa_id = v_empresa
  FOR UPDATE;

  UPDATE public.financeiro_extratos_bancarios
  SET movimentacao_id = NULL,
      conciliado = false
  WHERE id = p_extrato_id
    AND empresa_id = v_empresa;

  IF v_mov_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.financeiro_extratos_bancarios e2
      WHERE e2.empresa_id = v_empresa
        AND e2.movimentacao_id = v_mov_id
    ) THEN
      UPDATE public.financeiro_movimentacoes
      SET conciliado = false
      WHERE id = v_mov_id
        AND empresa_id = v_empresa;
    END IF;
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_desvincular: extrato=' || p_extrato_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_extratos_bancarios_desvincular(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_extratos_bancarios_desvincular(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_contas_correntes_set_padrao(
  p_id uuid,
  p_para text,
  p_value boolean default true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_exists boolean;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','update');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][TESOURARIA] Nenhuma empresa ativa encontrada.' USING errcode = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.financeiro_contas_correntes cc
    WHERE cc.id = p_id
      AND cc.empresa_id = v_empresa
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION '[FINANCEIRO][TESOURARIA] Conta corrente não encontrada.' USING errcode = 'P0002';
  END IF;

  IF lower(p_para) IN ('pagamento','pagamentos') THEN
    UPDATE public.financeiro_contas_correntes
    SET
      padrao_para_pagamentos = p_value,
      ativo = case when p_value then true else ativo end,
      updated_at = now()
    WHERE empresa_id = v_empresa
      AND id = p_id;

    IF p_value THEN
      UPDATE public.financeiro_contas_correntes
      SET padrao_para_pagamentos = false, updated_at = now()
      WHERE empresa_id = v_empresa
        AND id <> p_id;
    END IF;
  ELSIF lower(p_para) IN ('recebimento','recebimentos') THEN
    UPDATE public.financeiro_contas_correntes
    SET
      padrao_para_recebimentos = p_value,
      ativo = case when p_value then true else ativo end,
      updated_at = now()
    WHERE empresa_id = v_empresa
      AND id = p_id;

    IF p_value THEN
      UPDATE public.financeiro_contas_correntes
      SET padrao_para_recebimentos = false, updated_at = now()
      WHERE empresa_id = v_empresa
        AND id <> p_id;
    END IF;
  ELSE
    RAISE EXCEPTION '[FINANCEIRO][TESOURARIA] Parâmetro inválido: p_para deve ser pagamentos ou recebimentos.' USING errcode = '22023';
  END IF;

  PERFORM pg_notify('app_log', '[RPC] financeiro_contas_correntes_set_padrao: ' || p_id || ' ' || p_para);
  RETURN public.financeiro_contas_correntes_get(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_contas_correntes_set_padrao(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_contas_correntes_set_padrao(uuid, text, boolean) TO authenticated, service_role;

-- Tesouraria: escolher conta padrão (cria Caixa quando necessário)
CREATE OR REPLACE FUNCTION public.financeiro_conta_corrente_escolher(p_para text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('tesouraria','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][caixa] empresa_id inválido' USING errcode='42501';
  END IF;

  IF lower(coalesce(p_para,'')) = 'pagamento' THEN
    SELECT cc.id
      INTO v_id
    FROM public.financeiro_contas_correntes cc
    WHERE cc.empresa_id = v_empresa
      AND cc.ativo
      AND cc.padrao_para_pagamentos
    ORDER BY cc.updated_at DESC
    LIMIT 1;
  ELSE
    SELECT cc.id
      INTO v_id
    FROM public.financeiro_contas_correntes cc
    WHERE cc.empresa_id = v_empresa
      AND cc.ativo
      AND cc.padrao_para_recebimentos
    ORDER BY cc.updated_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    -- Só cria "Caixa" se tiver permissão de criação
    PERFORM public.require_permission_for_current_user('tesouraria','create');

    SELECT cc.id
      INTO v_id
    FROM public.financeiro_contas_correntes cc
    WHERE cc.empresa_id = v_empresa
      AND cc.ativo
      AND cc.tipo = 'caixa'
    ORDER BY cc.updated_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.financeiro_contas_correntes (
        empresa_id,
        nome,
        banco_nome,
        tipo,
        saldo_inicial,
        data_saldo_inicial,
        permite_saldo_negativo,
        ativo,
        padrao_para_pagamentos,
        padrao_para_recebimentos,
        observacoes
      ) VALUES (
        v_empresa,
        'Caixa',
        'Caixa',
        'caixa',
        0,
        current_date,
        true,
        true,
        true,
        true,
        'Criado automaticamente para permitir baixas rápidas (receber/pagar).'
      )
      RETURNING id INTO v_id;
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_corrente_escolher(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_corrente_escolher(text) TO authenticated, service_role;

-- Receber / Pagar (gera movimentação)
CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_receber_v2(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null,
  p_conta_corrente_id uuid default null
)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_cc_id uuid;
  v_valor numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_receber','update');
  PERFORM public.require_permission_for_current_user('tesouraria','create');

  SELECT *
    INTO rec
  FROM public.contas_a_receber
  WHERE id = p_id
    AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][receber] Conta a receber não encontrada.' USING errcode = 'P0001';
  END IF;

  IF rec.status = 'cancelado' THEN
    RAISE EXCEPTION '[FINANCEIRO][receber] Não é possível receber uma conta cancelada.' USING errcode = 'P0001';
  END IF;

  IF rec.status <> 'pago' THEN
    UPDATE public.contas_a_receber
    SET
      status = 'pago',
      data_pagamento = v_data,
      valor_pago = coalesce(p_valor_pago, rec.valor)
    WHERE id = rec.id
      AND empresa_id = v_empresa
    RETURNING * INTO rec;
  END IF;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_data := coalesce(rec.data_pagamento, v_data);
  v_valor := coalesce(rec.valor_pago, p_valor_pago, rec.valor);

  INSERT INTO public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) VALUES (
    v_empresa,
    v_cc_id,
    v_data,
    rec.data_vencimento,
    'entrada',
    v_valor,
    CASE
      WHEN rec.descricao IS NULL OR btrim(rec.descricao) = '' THEN 'Recebimento'
      ELSE 'Recebimento: ' || rec.descricao
    END,
    NULL,
    'conta_a_receber',
    rec.id,
    NULL,
    NULL,
    false,
    NULL
  )
  ON CONFLICT (empresa_id, origem_tipo, origem_id)
    WHERE origem_tipo IS NOT NULL AND origem_id IS NOT NULL
  DO NOTHING;

  PERFORM pg_notify('app_log', '[RPC] financeiro_conta_a_receber_receber_v2 ' || p_id);
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_a_receber_receber(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null
)
RETURNS public.contas_a_receber
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.financeiro_conta_a_receber_receber_v2(p_id, p_data_pagamento, p_valor_pago, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_a_receber_receber(uuid, date, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_a_receber_receber(uuid, date, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_pagar_pagar_v2(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null,
  p_conta_corrente_id uuid default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_total numeric;
  v_cc_id uuid;
  v_valor numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('contas_a_pagar','update');
  PERFORM public.require_permission_for_current_user('tesouraria','create');

  SELECT *
    INTO rec
  FROM public.financeiro_contas_pagar
  WHERE id = p_id
    AND empresa_id = v_empresa;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar] Conta a pagar não encontrada.' USING errcode = 'P0001';
  END IF;

  IF rec.status = 'cancelada' THEN
    RAISE EXCEPTION '[FINANCEIRO][pagar] Não é possível pagar uma conta cancelada.' USING errcode = 'P0001';
  END IF;

  v_total := (rec.valor_total + rec.multa + rec.juros - rec.desconto);

  IF rec.status <> 'paga' THEN
    UPDATE public.financeiro_contas_pagar
    SET
      status = 'paga',
      data_pagamento = v_data,
      valor_pago = coalesce(p_valor_pago, v_total)
    WHERE id = rec.id
      AND empresa_id = v_empresa
    RETURNING * INTO rec;
  END IF;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));
  v_data := coalesce(rec.data_pagamento, v_data);
  v_valor := coalesce(rec.valor_pago, p_valor_pago, v_total);

  INSERT INTO public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) VALUES (
    v_empresa,
    v_cc_id,
    v_data,
    rec.data_vencimento,
    'saida',
    v_valor,
    CASE
      WHEN rec.descricao IS NULL OR btrim(rec.descricao) = '' THEN 'Pagamento'
      ELSE 'Pagamento: ' || rec.descricao
    END,
    rec.documento_ref,
    'conta_a_pagar',
    rec.id,
    rec.categoria,
    rec.centro_custo,
    false,
    NULL
  )
  ON CONFLICT (empresa_id, origem_tipo, origem_id)
    WHERE origem_tipo IS NOT NULL AND origem_id IS NOT NULL
  DO NOTHING;

  PERFORM pg_notify('app_log', '[RPC] financeiro_conta_pagar_pagar_v2 ' || p_id);

  RETURN to_jsonb(rec)
    || jsonb_build_object('saldo', (rec.valor_total + rec.multa + rec.juros - rec.desconto) - rec.valor_pago);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_conta_pagar_pagar(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.financeiro_conta_pagar_pagar_v2(p_id, p_data_pagamento, p_valor_pago, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_conta_pagar_pagar(uuid, date, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_conta_pagar_pagar(uuid, date, numeric) TO authenticated, service_role;

-- Relatórios Financeiros (resumo)
CREATE OR REPLACE FUNCTION public.financeiro_relatorios_resumo(
  p_start_date date default null,
  p_end_date date default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
  v_receber jsonb;
  v_pagar jsonb;
  v_caixa jsonb;
  v_series jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('relatorios_financeiro','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[FIN][RELATORIOS] empresa_id inválido' USING errcode = '42501';
  END IF;

  IF v_end < v_start THEN
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  END IF;

  select jsonb_build_object(
    'total_pendente',  coalesce(sum(case when c.status = 'pendente'::public.status_conta_receber and c.data_vencimento between v_start and v_end then c.valor end), 0),
    'total_vencido',   coalesce(sum(case when (c.status = 'vencido'::public.status_conta_receber or (c.status = 'pendente'::public.status_conta_receber and c.data_vencimento < current_date)) and c.data_vencimento between v_start and v_end then c.valor end), 0),
    'total_cancelado', coalesce(sum(case when c.status = 'cancelado'::public.status_conta_receber and c.data_vencimento between v_start and v_end then c.valor end), 0),
    'total_pago',      coalesce(sum(case when c.status = 'pago'::public.status_conta_receber and c.data_pagamento between v_start and v_end then coalesce(c.valor_pago, c.valor) end), 0),
    'qtd_pendente',    coalesce(count(*) filter (where c.status = 'pendente'::public.status_conta_receber and c.data_vencimento between v_start and v_end), 0),
    'qtd_vencido',     coalesce(count(*) filter (where (c.status = 'vencido'::public.status_conta_receber or (c.status = 'pendente'::public.status_conta_receber and c.data_vencimento < current_date)) and c.data_vencimento between v_start and v_end), 0),
    'qtd_pago',        coalesce(count(*) filter (where c.status = 'pago'::public.status_conta_receber and c.data_pagamento between v_start and v_end), 0)
  )
  into v_receber
  from public.contas_a_receber c
  where c.empresa_id = v_empresa;

  select jsonb_build_object(
    'total_aberta',    coalesce(sum(case when cp.status = 'aberta' and cp.data_vencimento between v_start and v_end then cp.valor_total end), 0),
    'total_parcial',   coalesce(sum(case when cp.status = 'parcial' and cp.data_vencimento between v_start and v_end then (cp.valor_total - coalesce(cp.valor_pago,0)) end), 0),
    'total_cancelada', coalesce(sum(case when cp.status = 'cancelada' and cp.data_vencimento between v_start and v_end then cp.valor_total end), 0),
    'total_paga',      coalesce(sum(case when cp.status = 'paga' and cp.data_pagamento between v_start and v_end then coalesce(cp.valor_pago, cp.valor_total) end), 0),
    'total_vencida',   coalesce(sum(case when cp.status in ('aberta','parcial') and cp.data_vencimento < current_date and cp.data_vencimento between v_start and v_end then (cp.valor_total - coalesce(cp.valor_pago,0)) end), 0),
    'qtd_aberta',      coalesce(count(*) filter (where cp.status = 'aberta' and cp.data_vencimento between v_start and v_end), 0),
    'qtd_parcial',     coalesce(count(*) filter (where cp.status = 'parcial' and cp.data_vencimento between v_start and v_end), 0),
    'qtd_paga',        coalesce(count(*) filter (where cp.status = 'paga' and cp.data_pagamento between v_start and v_end), 0)
  )
  into v_pagar
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = v_empresa;

  select jsonb_build_object(
    'contas_ativas', count(*) filter (where cc.ativo),
    'saldo_total', coalesce(sum(
      case when cc.ativo then (
        cc.saldo_inicial
        + coalesce((
            select sum(case when m.tipo_mov = 'entrada' then m.valor else -m.valor end)
            from public.financeiro_movimentacoes m
            where m.empresa_id = v_empresa
              and m.conta_corrente_id = cc.id
              and m.data_movimento <= v_end
          ), 0)
      ) else 0 end
    ), 0)
  )
  into v_caixa
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa;

  with months as (
    select generate_series(
      date_trunc('month', v_start)::date,
      date_trunc('month', v_end)::date,
      interval '1 month'
    )::date as mes
  ),
  mov as (
    select
      date_trunc('month', m.data_movimento)::date as mes,
      sum(case when m.tipo_mov = 'entrada' then m.valor else 0 end) as entradas,
      sum(case when m.tipo_mov = 'saida' then m.valor else 0 end) as saidas
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.data_movimento between v_start and v_end
    group by 1
  ),
  rec as (
    select
      date_trunc('month', c.data_pagamento)::date as mes,
      sum(coalesce(c.valor_pago, c.valor)) as receber_pago
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status = 'pago'::public.status_conta_receber
      and c.data_pagamento between v_start and v_end
    group by 1
  ),
  pag as (
    select
      date_trunc('month', cp.data_pagamento)::date as mes,
      sum(coalesce(cp.valor_pago, cp.valor_total)) as pagar_pago
    from public.financeiro_contas_pagar cp
    where cp.empresa_id = v_empresa
      and cp.status = 'paga'
      and cp.data_pagamento between v_start and v_end
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'mes', to_char(m.mes, 'YYYY-MM'),
      'entradas', coalesce(mov.entradas, 0),
      'saidas', coalesce(mov.saidas, 0),
      'receber_pago', coalesce(rec.receber_pago, 0),
      'pagar_pago', coalesce(pag.pagar_pago, 0)
    )
    order by m.mes
  )
  into v_series
  from months m
  left join mov on mov.mes = m.mes
  left join rec on rec.mes = m.mes
  left join pag on pag.mes = m.mes;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', v_start::text, 'fim', v_end::text),
    'receber', coalesce(v_receber, '{}'::jsonb),
    'pagar', coalesce(v_pagar, '{}'::jsonb),
    'caixa', coalesce(v_caixa, '{}'::jsonb),
    'series', coalesce(v_series, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_relatorios_resumo(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_relatorios_resumo(date, date) TO authenticated, service_role;

-- Centros de Custo (enforcement)
CREATE OR REPLACE FUNCTION public.financeiro_centros_custos_list(
  p_search text   default null,
  p_tipo   text   default null,
  p_ativo  boolean default null,
  p_limit  int    default 200,
  p_offset int    default 0
)
RETURNS TABLE (
  id uuid,
  parent_id uuid,
  codigo text,
  nome text,
  tipo text,
  nivel int,
  ordem int,
  ativo boolean,
  observacoes text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('centros_de_custo','view');

  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('receita','despesa','investimento','outro') THEN
    RAISE EXCEPTION 'Tipo de centro de custo inválido.';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.parent_id,
    c.codigo,
    c.nome,
    c.tipo,
    c.nivel,
    c.ordem,
    c.ativo,
    c.observacoes,
    COUNT(*) OVER() AS total_count
  FROM public.financeiro_centros_custos c
  WHERE c.empresa_id = v_empresa
    AND (p_tipo IS NULL OR c.tipo = p_tipo)
    AND (p_ativo IS NULL OR c.ativo = p_ativo)
    AND (
      p_search IS NULL
      OR c.nome ILIKE '%'||p_search||'%'
      OR COALESCE(c.codigo,'') ILIKE '%'||p_search||'%'
      OR COALESCE(c.observacoes,'') ILIKE '%'||p_search||'%'
    )
  ORDER BY
    c.nivel ASC,
    c.parent_id NULLS FIRST,
    c.ordem ASC,
    c.nome ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_centros_custos_list(text, text, boolean, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_centros_custos_list(text, text, boolean, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_centros_custos_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_result jsonb;
  v_has_children boolean;
BEGIN
  PERFORM public.require_permission_for_current_user('centros_de_custo','view');

  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_centros_custos c2
    WHERE c2.empresa_id = v_empresa
      AND c2.parent_id = p_id
  )
  INTO v_has_children;

  SELECT
    to_jsonb(c.*)
    || jsonb_build_object(
         'parent_nome', p.nome,
         'has_children', COALESCE(v_has_children, false)
       )
  INTO v_result
  FROM public.financeiro_centros_custos c
  LEFT JOIN public.financeiro_centros_custos p
    ON p.id = c.parent_id
   AND p.empresa_id = v_empresa
  WHERE c.id = p_id
    AND c.empresa_id = v_empresa;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_centros_custos_get(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_centros_custos_get(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_centros_custos_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_parent  uuid;
  v_tipo    text;
  v_nivel   int;
  v_ordem   int;
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('centros_de_custo','create');
  ELSE
    PERFORM public.require_permission_for_current_user('centros_de_custo','update');
  END IF;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION '[RPC][FIN_CCUSTOS] empresa_id inválido' USING errcode='42501';
  END IF;

  IF p_payload->>'nome' IS NULL OR trim(p_payload->>'nome') = '' THEN
    RAISE EXCEPTION 'Nome do centro de custo é obrigatório.';
  END IF;

  v_parent := (p_payload->>'parent_id')::uuid;
  v_tipo   := COALESCE(p_payload->>'tipo', 'despesa');

  IF v_tipo NOT IN ('receita','despesa','investimento','outro') THEN
    RAISE EXCEPTION 'Tipo de centro de custo inválido.';
  END IF;

  IF v_parent IS NOT NULL THEN
    PERFORM 1
    FROM public.financeiro_centros_custos c
    WHERE c.id = v_parent
      AND c.empresa_id = v_empresa;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Centro de custo pai não encontrado ou acesso negado.';
    END IF;
  END IF;

  IF v_parent IS NULL THEN
    v_nivel := 1;
  ELSE
    SELECT COALESCE(nivel, 1) + 1
    INTO v_nivel
    FROM public.financeiro_centros_custos
    WHERE id = v_parent
      AND empresa_id = v_empresa;
  END IF;

  v_ordem := COALESCE((p_payload->>'ordem')::int, 0);

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.financeiro_centros_custos c
    SET
      parent_id   = v_parent,
      codigo      = p_payload->>'codigo',
      nome        = p_payload->>'nome',
      tipo        = v_tipo,
      nivel       = v_nivel,
      ordem       = v_ordem,
      ativo       = COALESCE((p_payload->>'ativo')::boolean, ativo),
      observacoes = p_payload->>'observacoes'
    WHERE c.id = (p_payload->>'id')::uuid
      AND c.empresa_id = v_empresa
    RETURNING c.id INTO v_id;
  ELSE
    INSERT INTO public.financeiro_centros_custos (
      empresa_id,
      parent_id,
      codigo,
      nome,
      tipo,
      nivel,
      ordem,
      ativo,
      observacoes
    ) VALUES (
      v_empresa,
      v_parent,
      p_payload->>'codigo',
      p_payload->>'nome',
      v_tipo,
      v_nivel,
      v_ordem,
      COALESCE((p_payload->>'ativo')::boolean, true),
      p_payload->>'observacoes'
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM pg_notify('app_log','[RPC] financeiro_centros_custos_upsert: ' || v_id);
  RETURN public.financeiro_centros_custos_get(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_centros_custos_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_centros_custos_upsert(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.financeiro_centros_custos_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_has_children boolean;
BEGIN
  PERFORM public.require_permission_for_current_user('centros_de_custo','delete');

  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_centros_custos c
    WHERE c.empresa_id = v_empresa
      AND c.parent_id = p_id
  )
  INTO v_has_children;

  IF v_has_children THEN
    RAISE EXCEPTION 'Centro de custo possui sub-centros vinculados. Remova ou remaneje os filhos antes de excluir.';
  END IF;

  DELETE FROM public.financeiro_centros_custos
  WHERE id = p_id
    AND empresa_id = v_empresa;

  PERFORM pg_notify('app_log','[RPC] financeiro_centros_custos_delete: ' || p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_centros_custos_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.financeiro_centros_custos_delete(uuid) TO authenticated, service_role;

COMMIT;
