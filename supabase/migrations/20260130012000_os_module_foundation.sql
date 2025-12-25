-- =============================================================================
-- OS (Ordens de Serviço): base do módulo para banco limpo (CI/verify)
-- Objetivo:
-- - Trazer para supabase/migrations o que estava em migrations_legacy
-- - Garantir que o CI (verify migrations em banco limpo) não quebre
-- - Manter compat com o frontend atual (RPCs e assinaturas)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Enum status_os (idempotente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'status_os'
      AND t.typnamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'CREATE TYPE public.status_os AS ENUM (''orcamento'',''aberta'',''concluida'',''cancelada'')';
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Tabelas (idempotente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ordem_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero bigint NOT NULL,
  cliente_id uuid REFERENCES public.pessoas(id),
  status public.status_os NOT NULL DEFAULT 'orcamento',
  descricao text,
  consideracoes_finais text,
  data_inicio date,
  data_prevista date,
  hora time,
  data_conclusao date,
  total_itens numeric(14,2) NOT NULL DEFAULT 0,
  desconto_valor numeric(14,2) NOT NULL DEFAULT 0,
  total_geral numeric(14,2) NOT NULL DEFAULT 0,
  vendedor text,
  comissao_percentual numeric(5,2),
  comissao_valor numeric(14,2),
  tecnico text,
  orcar boolean DEFAULT false,
  forma_recebimento text,
  meio text,
  conta_bancaria text,
  categoria_financeira text,
  condicao_pagamento text,
  observacoes text,
  observacoes_internas text,
  anexos text[],
  marcadores text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ordem integer,
  total_descontos numeric GENERATED ALWAYS AS (desconto_valor) STORED
);

CREATE TABLE IF NOT EXISTS public.ordem_servico_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ordem_servico_id uuid NOT NULL REFERENCES public.ordem_servicos(id) ON DELETE CASCADE,
  servico_id uuid REFERENCES public.servicos(id),
  descricao text NOT NULL,
  codigo text,
  quantidade numeric(14,3) NOT NULL DEFAULT 1,
  preco numeric(14,2) NOT NULL DEFAULT 0,
  desconto_pct numeric(6,3) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  orcar boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  valor_unitario numeric GENERATED ALWAYS AS (preco) STORED,
  desconto numeric GENERATED ALWAYS AS (desconto_pct) STORED,
  os_id uuid GENERATED ALWAYS AS (ordem_servico_id) STORED
);

-- Constraints idempotentes (PK/unique em bases que já existam sem elas)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordem_servicos_empresa_id_numero_key') THEN
    ALTER TABLE public.ordem_servicos
      ADD CONSTRAINT ordem_servicos_empresa_id_numero_key UNIQUE (empresa_id, numero);
  END IF;
END$$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ordem_servicos_empresa_id ON public.ordem_servicos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ordem_servicos_empresa_status_prevista ON public.ordem_servicos(empresa_id, status, data_prevista);
CREATE INDEX IF NOT EXISTS idx_ordem_servicos_empresa_ordem ON public.ordem_servicos(empresa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_os_itens_empresa_id ON public.ordem_servico_itens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_os_itens_os_id ON public.ordem_servico_itens(ordem_servico_id);

-- -----------------------------------------------------------------------------
-- RLS + Policies (empresa atual)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ordem_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_servico_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_os_by_empresa ON public.ordem_servicos;
CREATE POLICY sel_os_by_empresa ON public.ordem_servicos
  FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS ins_os_same_empresa ON public.ordem_servicos;
CREATE POLICY ins_os_same_empresa ON public.ordem_servicos
  FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS upd_os_same_empresa ON public.ordem_servicos;
CREATE POLICY upd_os_same_empresa ON public.ordem_servicos
  FOR UPDATE USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS del_os_same_empresa ON public.ordem_servicos;
CREATE POLICY del_os_same_empresa ON public.ordem_servicos
  FOR DELETE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS sel_os_itens_by_empresa ON public.ordem_servico_itens;
CREATE POLICY sel_os_itens_by_empresa ON public.ordem_servico_itens
  FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS ins_os_itens_same_empresa ON public.ordem_servico_itens;
CREATE POLICY ins_os_itens_same_empresa ON public.ordem_servico_itens
  FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS upd_os_itens_same_empresa ON public.ordem_servico_itens;
CREATE POLICY upd_os_itens_same_empresa ON public.ordem_servico_itens
  FOR UPDATE USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS del_os_itens_same_empresa ON public.ordem_servico_itens;
CREATE POLICY del_os_itens_same_empresa ON public.ordem_servico_itens
  FOR DELETE USING (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- Triggers updated_at (idempotente)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_ordem_servicos_set_updated_at ON public.ordem_servicos;
CREATE TRIGGER tg_ordem_servicos_set_updated_at
BEFORE UPDATE ON public.ordem_servicos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_ordem_servico_itens_set_updated_at ON public.ordem_servico_itens;
CREATE TRIGGER tg_ordem_servico_itens_set_updated_at
BEFORE UPDATE ON public.ordem_servico_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers: numeração, recálculo e triggers de itens
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_os_number_for_current_empresa()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_num bigint;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[OS] empresa_id inválido' USING errcode='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(('x'||substr(replace(v_empresa_id::text,'-',''),1,16))::bit(64)::bigint);

  SELECT COALESCE(MAX(numero), 0) + 1
    INTO v_num
  FROM public.ordem_servicos
  WHERE empresa_id = v_empresa_id;

  RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION public.next_os_number_for_current_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_os_number_for_current_empresa() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.os_calc_item_total(p_qty numeric, p_price numeric, p_discount_pct numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round((greatest(coalesce(p_qty,1), 0.0001) * coalesce(p_price,0)) * (1 - coalesce(p_discount_pct,0)/100.0), 2)
$$;

REVOKE ALL ON FUNCTION public.os_calc_item_total(numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.os_calc_item_total(numeric, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.os_recalc_totals(p_os_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_total_itens numeric := 0;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][RECALC] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT COALESCE(SUM(total), 0)
  INTO v_total_itens
  FROM public.ordem_servico_itens
  WHERE empresa_id = v_emp
    AND ordem_servico_id = p_os_id;

  UPDATE public.ordem_servicos os
     SET total_itens = v_total_itens,
         total_geral = GREATEST(v_total_itens - COALESCE(os.desconto_valor,0), 0),
         updated_at = now()
   WHERE os.id = p_os_id
     AND os.empresa_id = v_emp;
END;
$$;

REVOKE ALL ON FUNCTION public.os_recalc_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.os_recalc_totals(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_os_item_total_and_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.total := public.os_calc_item_total(NEW.quantidade, NEW.preco, NEW.desconto_pct);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_os_item_total_and_recalc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_os_item_total_and_recalc() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_os_item_after_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_os_id uuid;
BEGIN
  v_os_id := COALESCE(NEW.ordem_servico_id, OLD.ordem_servico_id);
  PERFORM public.os_recalc_totals(v_os_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.tg_os_item_after_recalc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_os_item_after_recalc() TO authenticated, service_role;

DROP TRIGGER IF EXISTS tg_os_item_before ON public.ordem_servico_itens;
CREATE TRIGGER tg_os_item_before
BEFORE INSERT OR UPDATE ON public.ordem_servico_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_os_item_total_and_recalc();

DROP TRIGGER IF EXISTS tg_os_item_after_change ON public.ordem_servico_itens;
CREATE TRIGGER tg_os_item_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.ordem_servico_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_os_item_after_recalc();

-- -----------------------------------------------------------------------------
-- RPCs OS (compat com frontend)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_os_for_current_user(payload jsonb)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][CREATE_OS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  INSERT INTO public.ordem_servicos (
    empresa_id,
    numero,
    cliente_id,
    status,
    descricao,
    consideracoes_finais,
    data_inicio,
    data_prevista,
    hora,
    data_conclusao,
    desconto_valor,
    vendedor,
    comissao_percentual,
    comissao_valor,
    tecnico,
    orcar,
    forma_recebimento,
    meio,
    conta_bancaria,
    categoria_financeira,
    condicao_pagamento,
    observacoes,
    observacoes_internas,
    anexos,
    marcadores,
    ordem
  )
  VALUES (
    v_empresa_id,
    COALESCE(NULLIF(payload->>'numero','')::bigint, public.next_os_number_for_current_empresa()),
    NULLIF(payload->>'cliente_id','')::uuid,
    COALESCE(NULLIF(payload->>'status','')::public.status_os, 'orcamento'),
    NULLIF(payload->>'descricao',''),
    NULLIF(payload->>'consideracoes_finais',''),
    NULLIF(payload->>'data_inicio','')::date,
    NULLIF(payload->>'data_prevista','')::date,
    NULLIF(payload->>'hora','')::time,
    NULLIF(payload->>'data_conclusao','')::date,
    COALESCE(NULLIF(payload->>'desconto_valor','')::numeric, 0),
    NULLIF(payload->>'vendedor',''),
    NULLIF(payload->>'comissao_percentual','')::numeric,
    NULLIF(payload->>'comissao_valor','')::numeric,
    NULLIF(payload->>'tecnico',''),
    COALESCE(NULLIF(payload->>'orcar','')::boolean, false),
    NULLIF(payload->>'forma_recebimento',''),
    NULLIF(payload->>'meio',''),
    NULLIF(payload->>'conta_bancaria',''),
    NULLIF(payload->>'categoria_financeira',''),
    NULLIF(payload->>'condicao_pagamento',''),
    NULLIF(payload->>'observacoes',''),
    NULLIF(payload->>'observacoes_internas',''),
    CASE WHEN payload ? 'anexos' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'anexos')) ELSE NULL END,
    CASE WHEN payload ? 'marcadores' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'marcadores')) ELSE NULL END,
    NULLIF(payload->>'ordem','')::int
  )
  RETURNING * INTO rec;

  PERFORM public.os_recalc_totals(rec.id);
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.create_os_for_current_user(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_os_for_current_user(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_os_by_id_for_current_user(p_id uuid)
RETURNS public.ordem_servicos
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT os.*
  FROM public.ordem_servicos os
  WHERE os.id = p_id
    AND os.empresa_id = public.current_empresa_id()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_os_by_id_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_os_by_id_for_current_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_os_for_current_user(p_id uuid, payload jsonb)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][UPDATE_OS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  UPDATE public.ordem_servicos os
     SET cliente_id            = CASE WHEN payload ? 'cliente_id' THEN NULLIF(payload->>'cliente_id','')::uuid ELSE os.cliente_id END,
         status                = COALESCE(NULLIF(payload->>'status','')::public.status_os, os.status),
         descricao             = COALESCE(NULLIF(payload->>'descricao',''), os.descricao),
         consideracoes_finais  = COALESCE(NULLIF(payload->>'consideracoes_finais',''), os.consideracoes_finais),
         data_inicio           = CASE WHEN payload ? 'data_inicio' THEN NULLIF(payload->>'data_inicio','')::date ELSE os.data_inicio END,
         data_prevista         = CASE WHEN payload ? 'data_prevista' THEN NULLIF(payload->>'data_prevista','')::date ELSE os.data_prevista END,
         hora                  = CASE WHEN payload ? 'hora' THEN NULLIF(payload->>'hora','')::time ELSE os.hora END,
         data_conclusao        = CASE WHEN payload ? 'data_conclusao' THEN NULLIF(payload->>'data_conclusao','')::date ELSE os.data_conclusao END,
         desconto_valor        = COALESCE(NULLIF(payload->>'desconto_valor','')::numeric, os.desconto_valor),
         vendedor              = COALESCE(NULLIF(payload->>'vendedor',''), os.vendedor),
         comissao_percentual   = COALESCE(NULLIF(payload->>'comissao_percentual','')::numeric, os.comissao_percentual),
         comissao_valor        = COALESCE(NULLIF(payload->>'comissao_valor','')::numeric, os.comissao_valor),
         tecnico               = COALESCE(NULLIF(payload->>'tecnico',''), os.tecnico),
         orcar                 = COALESCE(NULLIF(payload->>'orcar','')::boolean, os.orcar),
         forma_recebimento     = COALESCE(NULLIF(payload->>'forma_recebimento',''), os.forma_recebimento),
         condicao_pagamento    = COALESCE(NULLIF(payload->>'condicao_pagamento',''), os.condicao_pagamento),
         observacoes           = COALESCE(NULLIF(payload->>'observacoes',''), os.observacoes),
         observacoes_internas  = COALESCE(NULLIF(payload->>'observacoes_internas',''), os.observacoes_internas),
         anexos                = CASE WHEN payload ? 'anexos' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'anexos')) ELSE os.anexos END,
         marcadores            = CASE WHEN payload ? 'marcadores' THEN ARRAY(SELECT jsonb_array_elements_text(payload->'marcadores')) ELSE os.marcadores END,
         ordem                 = COALESCE(NULLIF(payload->>'ordem','')::int, os.ordem),
         updated_at            = now()
   WHERE os.id = p_id
     AND os.empresa_id = v_empresa_id
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][UPDATE_OS] OS não encontrada na empresa atual' USING errcode='P0002';
  END IF;

  PERFORM public.os_recalc_totals(p_id);
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.update_os_for_current_user(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_os_for_current_user(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_os_for_current_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][DELETE_OS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  DELETE FROM public.ordem_servicos os
  WHERE os.id = p_id
    AND os.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][DELETE_OS] OS não encontrada na empresa atual' USING errcode='P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_os_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_os_for_current_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_os_items_for_current_user(p_os_id uuid)
RETURNS SETOF public.ordem_servico_itens
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT i.*
  FROM public.ordem_servico_itens i
  WHERE i.empresa_id = public.current_empresa_id()
    AND i.ordem_servico_id = p_os_id
  ORDER BY i.created_at ASC
$$;

REVOKE ALL ON FUNCTION public.list_os_items_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_os_items_for_current_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_product_item_to_os_for_current_user(
  p_os_id uuid,
  p_produto_id uuid,
  p_qtd numeric DEFAULT 1,
  p_desconto_pct numeric DEFAULT 0,
  p_orcar boolean DEFAULT false
)
RETURNS public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_os public.ordem_servicos;
  v_p public.produtos;
  v_it public.ordem_servico_itens;
  v_preco numeric;
  v_total numeric;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][ITEM] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT * INTO v_os
  FROM public.ordem_servicos
  WHERE id = p_os_id AND empresa_id = v_emp;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][OS][ITEM] OS não encontrada na empresa atual' USING errcode='P0002';
  END IF;

  SELECT * INTO v_p
  FROM public.produtos
  WHERE id = p_produto_id AND empresa_id = v_emp;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][OS][ITEM] Produto não encontrado na empresa atual' USING errcode='P0002';
  END IF;

  v_preco := COALESCE(v_p.preco_venda, 0);
  v_total := public.os_calc_item_total(p_qtd, v_preco, p_desconto_pct);

  INSERT INTO public.ordem_servico_itens (
    empresa_id, ordem_servico_id, servico_id, descricao, codigo,
    quantidade, preco, desconto_pct, total, orcar
  ) VALUES (
    v_emp, v_os.id, NULL, v_p.nome, v_p.sku,
    GREATEST(COALESCE(p_qtd,1), 0.0001), v_preco, COALESCE(p_desconto_pct,0), v_total, COALESCE(p_orcar,false)
  )
  RETURNING * INTO v_it;

  PERFORM public.os_recalc_totals(v_os.id);
  RETURN v_it;
END;
$$;

REVOKE ALL ON FUNCTION public.add_product_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_product_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_service_item_to_os_for_current_user(
  p_os_id uuid,
  p_servico_id uuid,
  p_qtd numeric DEFAULT 1,
  p_desconto_pct numeric DEFAULT 0,
  p_orcar boolean DEFAULT false
)
RETURNS public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_os public.ordem_servicos;
  v_s public.servicos;
  v_it public.ordem_servico_itens;
  v_preco numeric;
  v_total numeric;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][ITEM] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT * INTO v_os
  FROM public.ordem_servicos
  WHERE id = p_os_id AND empresa_id = v_emp;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][OS][ITEM] OS não encontrada na empresa atual' USING errcode='P0002';
  END IF;

  SELECT * INTO v_s
  FROM public.servicos
  WHERE id = p_servico_id AND empresa_id = v_emp;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][OS][ITEM] Serviço não encontrado na empresa atual' USING errcode='P0002';
  END IF;

  v_preco := COALESCE(v_s.preco_venda, 0);
  v_total := public.os_calc_item_total(p_qtd, v_preco, p_desconto_pct);

  INSERT INTO public.ordem_servico_itens (
    empresa_id, ordem_servico_id, servico_id, descricao, codigo,
    quantidade, preco, desconto_pct, total, orcar
  ) VALUES (
    v_emp, v_os.id, v_s.id, v_s.descricao, v_s.codigo,
    GREATEST(COALESCE(p_qtd,1), 0.0001), v_preco, COALESCE(p_desconto_pct,0), v_total, COALESCE(p_orcar,false)
  )
  RETURNING * INTO v_it;

  PERFORM public.os_recalc_totals(v_os.id);
  RETURN v_it;
END;
$$;

REVOKE ALL ON FUNCTION public.add_service_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_service_item_to_os_for_current_user(uuid, uuid, numeric, numeric, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_os_item_for_current_user(p_os_id uuid, payload jsonb)
RETURNS public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_os uuid := p_os_id;
  v_prod uuid;
  v_serv uuid;
  v_qtd numeric := 1;
  v_desc_pct numeric := 0;
  v_orcar boolean := false;
  v_item public.ordem_servico_itens;
BEGIN
  v_os := COALESCE(v_os, NULLIF(payload->>'os_id','')::uuid, NULLIF(payload->>'ordem_servico_id','')::uuid);
  IF v_os IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][ITEM][ADD] os_id ausente' USING errcode='22023';
  END IF;

  v_prod := NULLIF(payload->>'produto_id','')::uuid;
  v_serv := NULLIF(payload->>'servico_id','')::uuid;

  v_qtd := COALESCE(NULLIF(payload->>'quantidade','')::numeric, NULLIF(payload->>'qtd','')::numeric, 1);
  IF v_qtd IS NULL OR v_qtd <= 0 THEN v_qtd := 1; END IF;

  v_desc_pct := COALESCE(NULLIF(payload->>'desconto_pct','')::numeric, NULLIF(payload->>'desconto','')::numeric, 0);
  IF v_desc_pct IS NOT NULL AND v_desc_pct BETWEEN 0 AND 1 THEN
    v_desc_pct := round(v_desc_pct * 100, 2);
  END IF;
  IF v_desc_pct < 0 THEN v_desc_pct := 0; END IF;
  IF v_desc_pct > 100 THEN v_desc_pct := 100; END IF;

  v_orcar := COALESCE(NULLIF(payload->>'orcar','')::boolean, false);

  IF v_prod IS NOT NULL AND v_serv IS NOT NULL THEN
    RAISE EXCEPTION '[RPC][OS][ITEM][ADD] payload ambíguo: produto_id e servico_id' USING errcode='22023';
  ELSIF v_prod IS NOT NULL THEN
    v_item := public.add_product_item_to_os_for_current_user(v_os, v_prod, v_qtd, v_desc_pct, v_orcar);
  ELSIF v_serv IS NOT NULL THEN
    v_item := public.add_service_item_to_os_for_current_user(v_os, v_serv, v_qtd, v_desc_pct, v_orcar);
  ELSE
    RAISE EXCEPTION '[RPC][OS][ITEM][ADD] payload sem produto_id/servico_id' USING errcode='22023';
  END IF;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.add_os_item_for_current_user(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_os_item_for_current_user(uuid, jsonb) TO authenticated, service_role;

-- Compat: overload (payload jsonb) aceita os dois campos (os_id / ordem_servico_id)
CREATE OR REPLACE FUNCTION public.add_os_item_for_current_user(payload jsonb)
RETURNS public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_os uuid;
BEGIN
  v_os := COALESCE(NULLIF(payload->>'os_id','')::uuid, NULLIF(payload->>'ordem_servico_id','')::uuid);
  IF v_os IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][ITEM][ADD][OVERLOAD] os_id ausente no payload' USING errcode='22023';
  END IF;
  RETURN public.add_os_item_for_current_user(v_os, payload);
END;
$$;

REVOKE ALL ON FUNCTION public.add_os_item_for_current_user(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_os_item_for_current_user(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_os_item_for_current_user(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_os_id uuid;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][DELETE_OS_ITEM] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  SELECT ordem_servico_id INTO v_os_id
  FROM public.ordem_servico_itens
  WHERE id = p_item_id
    AND empresa_id = v_empresa_id;

  DELETE FROM public.ordem_servico_itens i
  WHERE i.id = p_item_id
    AND i.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][DELETE_OS_ITEM] Item não encontrado na empresa atual' USING errcode='P0002';
  END IF;

  PERFORM public.os_recalc_totals(v_os_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_os_item_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_os_item_for_current_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_kanban_os()
RETURNS TABLE(id uuid, numero bigint, descricao text, status public.status_os, data_prevista date, cliente_nome text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
STABLE
AS $$
  SELECT
    os.id,
    os.numero,
    os.descricao,
    os.status,
    os.data_prevista,
    p.nome AS cliente_nome
  FROM public.ordem_servicos os
  LEFT JOIN public.pessoas p
    ON p.id = os.cliente_id
   AND p.empresa_id = os.empresa_id
  WHERE os.empresa_id = public.current_empresa_id()
    AND os.status IN ('orcamento'::public.status_os, 'aberta'::public.status_os)
  ORDER BY COALESCE(os.ordem, 999999), os.numero DESC;
$$;

REVOKE ALL ON FUNCTION public.list_kanban_os() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_kanban_os() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_os_for_current_user(
  p_search text DEFAULT NULL,
  p_status public.status_os[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_order_by text DEFAULT 'ordem',
  p_order_dir text DEFAULT 'asc'
)
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  numero bigint,
  cliente_id uuid,
  descricao text,
  status public.status_os,
  data_inicio date,
  data_prevista date,
  hora time,
  total_itens numeric,
  desconto_valor numeric,
  total_geral numeric,
  forma_recebimento text,
  condicao_pagamento text,
  observacoes text,
  observacoes_internas text,
  created_at timestamptz,
  updated_at timestamptz,
  ordem integer,
  cliente_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_order_by text := lower(coalesce(p_order_by, 'ordem'));
  v_order_dir text := CASE WHEN lower(p_order_dir) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_order_col text;
  v_sql text;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][LIST_OS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  v_order_col := CASE
    WHEN v_order_by IN ('ordem','numero','descricao','status','data_prevista','created_at','updated_at') THEN v_order_by
    ELSE 'ordem'
  END;

  v_sql := format($fmt$
    SELECT
      os.id, os.empresa_id, os.numero, os.cliente_id, os.descricao, os.status,
      os.data_inicio, os.data_prevista, os.hora,
      os.total_itens, os.desconto_valor, os.total_geral,
      os.forma_recebimento, os.condicao_pagamento,
      os.observacoes, os.observacoes_internas,
      os.created_at, os.updated_at,
      os.ordem,
      p.nome as cliente_nome
    FROM public.ordem_servicos os
    LEFT JOIN public.pessoas p
      ON p.id = os.cliente_id
     AND p.empresa_id = os.empresa_id
    WHERE os.empresa_id = $1
      %s
      %s
    ORDER BY %I %s NULLS LAST, os.numero DESC
    LIMIT $2 OFFSET $3
  $fmt$,
    CASE
      WHEN p_search IS NULL OR btrim(p_search) = '' THEN ''
      ELSE 'AND (os.descricao ILIKE ''%''||$4||''%'' OR p.nome ILIKE ''%''||$4||''%'' OR os.numero::text ILIKE ''%''||$4||''%'')'
    END,
    CASE
      WHEN p_status IS NULL OR array_length(p_status,1) IS NULL THEN ''
      ELSE 'AND os.status = ANY($5)'
    END,
    v_order_col,
    v_order_dir
  );

  IF p_status IS NULL OR array_length(p_status,1) IS NULL THEN
    RETURN QUERY EXECUTE v_sql USING v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search;
  ELSE
    RETURN QUERY EXECUTE v_sql USING v_empresa_id, greatest(p_limit,0), greatest(p_offset,0), p_search, p_status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_os_order(p_os_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][ORDER] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  UPDATE public.ordem_servicos os
  SET ordem = s.pos
  FROM (
    SELECT unnest(p_os_ids) AS id, generate_subscripts(p_os_ids, 1) AS pos
  ) s
  WHERE os.id = s.id
    AND os.empresa_id = v_empresa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_os_order(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_os_order(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_os_data_prevista(p_os_id uuid, p_new_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][DATA_PREVISTA] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  UPDATE public.ordem_servicos os
  SET data_prevista = p_new_date,
      updated_at = now()
  WHERE os.id = p_os_id
    AND os.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][OS][DATA_PREVISTA] OS não encontrada na empresa atual' USING errcode='P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_os_data_prevista(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_os_data_prevista(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_items_for_os(
  p_search text,
  p_limit integer DEFAULT 20,
  p_only_sales boolean DEFAULT true,
  p_type text DEFAULT 'all'
)
RETURNS TABLE(id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_prod_filter text := '';
  v_sales_filter text := '';
  v_has_prod_status boolean;
  v_has_prod_ativo boolean;
  v_has_prod_allow_sales boolean;
  v_has_prod_pode_vender boolean;
  v_sql text;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][SEARCH_ITEMS] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'status'
  ) INTO v_has_prod_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'ativo'
  ) INTO v_has_prod_ativo;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'permitir_inclusao_vendas'
  ) INTO v_has_prod_allow_sales;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'pode_vender'
  ) INTO v_has_prod_pode_vender;

  IF v_has_prod_status THEN
    v_prod_filter := v_prod_filter || ' AND p.status = ''ativo''';
  ELSIF v_has_prod_ativo THEN
    v_prod_filter := v_prod_filter || ' AND p.ativo = true';
  END IF;

  IF COALESCE(p_only_sales, true) THEN
    IF v_has_prod_allow_sales THEN
      v_sales_filter := v_sales_filter || ' AND p.permitir_inclusao_vendas = true';
    ELSIF v_has_prod_pode_vender THEN
      -- Em bases antigas, pode_vender pode estar falso por default. Tratamos NULL como "não-configurado".
      v_sales_filter := v_sales_filter || ' AND (p.pode_vender = true OR p.pode_vender IS NULL)';
    END IF;
  END IF;

  v_sql := format($fmt$
    (
      SELECT
        p.id,
        'product' AS type,
        p.nome AS descricao,
        p.sku AS codigo,
        p.preco_venda::numeric AS preco_venda
      FROM public.produtos p
      WHERE p.empresa_id = $1
        AND (coalesce($4,'all') = 'all' OR coalesce($4,'all') = 'product')
        %s
        %s
        AND ($2 IS NULL OR p.nome ILIKE '%%' || $2 || '%%' OR coalesce(p.sku,'') ILIKE '%%' || $2 || '%%')
    )
    UNION ALL
    (
      SELECT
        s.id,
        'service' AS type,
        s.descricao,
        s.codigo,
        s.preco_venda::numeric
      FROM public.servicos s
      WHERE s.empresa_id = $1
        AND s.status = 'ativo'
        AND (coalesce($4,'all') = 'all' OR coalesce($4,'all') = 'service')
        AND ($2 IS NULL OR s.descricao ILIKE '%%' || $2 || '%%' OR coalesce(s.codigo,'') ILIKE '%%' || $2 || '%%')
    )
    ORDER BY descricao
    LIMIT $3
  $fmt$, v_prod_filter, v_sales_filter);

  RETURN QUERY EXECUTE v_sql USING v_empresa_id, p_search, greatest(COALESCE(p_limit, 20), 0), p_type;
END;
$$;

REVOKE ALL ON FUNCTION public.search_items_for_os(text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_items_for_os(text, integer, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seed_os_for_current_user(p_count integer DEFAULT 20)
RETURNS SETOF public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_count int := COALESCE(p_count, 20);
  v_cli uuid;
  v_os public.ordem_servicos;
  i int;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][SEED] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT p.id INTO v_cli
  FROM public.pessoas p
  WHERE p.empresa_id = v_emp
    AND p.deleted_at IS NULL
    AND p.tipo IN ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_cli IS NULL THEN
    RETURN;
  END IF;

  FOR i IN 1..greatest(v_count, 0) LOOP
    INSERT INTO public.ordem_servicos (empresa_id, numero, cliente_id, descricao, status, data_inicio, ordem)
    VALUES (
      v_emp,
      public.next_os_number_for_current_empresa(),
      v_cli,
      format('OS de exemplo #%s', i),
      (CASE (i % 4)
         WHEN 0 THEN 'orcamento'::public.status_os
         WHEN 1 THEN 'aberta'::public.status_os
         WHEN 2 THEN 'concluida'::public.status_os
         ELSE 'cancelada'::public.status_os
       END),
      (now()::date - (i % 7)),
      i
    )
    RETURNING * INTO v_os;

    RETURN NEXT v_os;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_os_for_current_user(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_os_for_current_user(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.os_set_status_for_current_user(
  p_os_id uuid,
  p_next public.status_os,
  p_opts jsonb DEFAULT '{}'::jsonb
)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_force boolean := COALESCE((p_opts->>'force')::boolean, false);
  v_os public.ordem_servicos;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][OS][STATUS] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT * INTO v_os
  FROM public.ordem_servicos
  WHERE id = p_os_id AND empresa_id = v_emp;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[RPC][OS][STATUS] OS não encontrada na empresa atual' USING errcode='P0002';
  END IF;

  -- Regras mínimas de transição: mantém simples e permite force para casos administrativos.
  IF NOT v_force THEN
    IF v_os.status = 'cancelada'::public.status_os AND p_next <> 'cancelada'::public.status_os THEN
      RAISE EXCEPTION '[RPC][OS][STATUS] OS cancelada não pode ser reaberta sem force' USING errcode='42501';
    END IF;
  END IF;

  UPDATE public.ordem_servicos os
     SET status = p_next,
         data_conclusao = CASE WHEN p_next IN ('concluida'::public.status_os, 'cancelada'::public.status_os) THEN now()::date ELSE NULL END,
         updated_at = now()
   WHERE os.id = p_os_id
     AND os.empresa_id = v_emp
  RETURNING * INTO v_os;

  RETURN v_os;
END;
$$;

REVOKE ALL ON FUNCTION public.os_set_status_for_current_user(uuid, public.status_os, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.os_set_status_for_current_user(uuid, public.status_os, jsonb) TO authenticated, service_role;

COMMIT;
