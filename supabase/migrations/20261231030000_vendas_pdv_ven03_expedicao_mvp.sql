/*
  PDV-01 / PDV-03 / VEN-03 / EXP-01 / EXP-02
  - PDV: cliente padrão (Consumidor Final) + estorno idempotente
  - Vendas: baixa de estoque idempotente ao concluir
  - Expedição: eventos/histórico + automações de datas
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Vendas: marcadores de idempotência (estoque/PDV)
-- -----------------------------------------------------------------------------
ALTER TABLE public.vendas_pedidos
  ADD COLUMN IF NOT EXISTS estoque_baixado_at timestamptz,
  ADD COLUMN IF NOT EXISTS estoque_baixado_ref text,
  ADD COLUMN IF NOT EXISTS pdv_estornado_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdv_estornado_by uuid;

-- -----------------------------------------------------------------------------
-- 2) PDV-01: cliente padrão ("Consumidor Final") para PDV (sem depender de módulo Cadastros)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_pdv_ensure_default_cliente()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'create');

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Empresa ativa não encontrada';
  END IF;

  SELECT p.id
    INTO v_id
    FROM public.pessoas p
   WHERE p.empresa_id = v_emp
     AND p.deleted_at IS NULL
     AND p.tipo IN ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
     AND lower(p.nome) = lower('Consumidor Final')
   ORDER BY p.created_at ASC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.pessoas (
    empresa_id, tipo, nome, doc_unico, email, telefone, tipo_pessoa, contribuinte_icms
  ) VALUES (
    v_emp,
    'cliente'::public.pessoa_tipo,
    'Consumidor Final',
    NULL,
    NULL,
    NULL,
    'fisica'::public.tipo_pessoa_enum,
    '9'::public.contribuinte_icms_enum
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_pdv_ensure_default_cliente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_pdv_ensure_default_cliente() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) VEN-03: baixa de estoque idempotente para um pedido
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_baixar_estoque(p_pedido_id uuid, p_documento_ref text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_numero int;
  v_doc text;
  r record;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'update');

  SELECT p.numero
    INTO v_numero
    FROM public.vendas_pedidos p
   WHERE p.id = p_pedido_id
     AND p.empresa_id = v_emp
   FOR UPDATE;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.vendas_pedidos p
     WHERE p.id = p_pedido_id
       AND p.empresa_id = v_emp
       AND p.estoque_baixado_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  v_doc := COALESCE(NULLIF(p_documento_ref, ''), 'VENDA-' || v_numero::text);

  FOR r IN
    SELECT i.produto_id, i.quantidade
      FROM public.vendas_itens_pedido i
     WHERE i.empresa_id = v_emp
       AND i.pedido_id = p_pedido_id
  LOOP
    PERFORM public.suprimentos_registrar_movimento(
      r.produto_id,
      'saida',
      r.quantidade,
      NULL,
      v_doc,
      'Saída de estoque (venda)'
    );
  END LOOP;

  UPDATE public.vendas_pedidos
     SET estoque_baixado_at = now(),
         estoque_baixado_ref = v_doc,
         updated_at = now()
   WHERE id = p_pedido_id
     AND empresa_id = v_emp;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_baixar_estoque(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_baixar_estoque(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.vendas_concluir_pedido(p_id uuid, p_baixar_estoque boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_row public.vendas_pedidos%ROWTYPE;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'update');

  SELECT *
    INTO v_row
    FROM public.vendas_pedidos
   WHERE id = p_id
     AND empresa_id = v_emp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_row.status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido cancelado não pode ser concluído';
  END IF;

  UPDATE public.vendas_pedidos
     SET status = 'concluido',
         updated_at = now()
   WHERE id = p_id
     AND empresa_id = v_emp;

  IF p_baixar_estoque THEN
    PERFORM public.vendas_baixar_estoque(p_id, 'VENDA-' || v_row.numero::text);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_concluir_pedido(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_concluir_pedido(uuid, boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) PDV-03: estorno idempotente (financeiro + estoque)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_pdv_estornar(p_pedido_id uuid, p_conta_corrente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_row public.vendas_pedidos%ROWTYPE;
  v_doc text;
  r record;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'update');

  SELECT *
    INTO v_row
    FROM public.vendas_pedidos
   WHERE id = p_pedido_id
     AND empresa_id = v_emp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF coalesce(v_row.canal, '') <> 'pdv' THEN
    RAISE EXCEPTION 'Estorno disponível apenas para pedidos do PDV';
  END IF;

  IF v_row.status <> 'concluido' THEN
    RAISE EXCEPTION 'Somente pedidos concluídos podem ser estornados';
  END IF;

  IF v_row.pdv_estornado_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_doc := 'PDV-ESTORNO-' || v_row.numero::text;

  -- Financeiro: saída (estorno)
  PERFORM public.financeiro_movimentacoes_upsert(
    jsonb_build_object(
      'conta_corrente_id', p_conta_corrente_id,
      'tipo_mov', 'saida',
      'valor', v_row.total_geral,
      'descricao', 'Estorno PDV #' || v_row.numero::text,
      'documento_ref', v_doc,
      'origem_tipo', 'venda_pdv_estorno',
      'origem_id', v_row.id,
      'categoria', 'Vendas',
      'observacoes', 'Estorno automático (PDV)'
    )
  );

  -- Estoque: entrada de devolução
  FOR r IN
    SELECT i.produto_id, i.quantidade
      FROM public.vendas_itens_pedido i
     WHERE i.empresa_id = v_emp
       AND i.pedido_id = v_row.id
  LOOP
    PERFORM public.suprimentos_registrar_movimento(
      r.produto_id,
      'entrada',
      r.quantidade,
      NULL,
      v_doc,
      'Estorno PDV (entrada de estoque)'
    );
  END LOOP;

  UPDATE public.vendas_pedidos
     SET status = 'cancelado',
         pdv_estornado_at = now(),
         pdv_estornado_by = auth.uid(),
         updated_at = now()
   WHERE id = v_row.id
     AND empresa_id = v_emp;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_pdv_estornar(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_pdv_estornar(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) EXP-01/02: histórico de expedição (eventos) + datas automáticas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendas_expedicao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  expedicao_id uuid NOT NULL REFERENCES public.vendas_expedicoes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('created','status','tracking','observacoes')),
  de_status text,
  para_status text,
  mensagem text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_vendas_expedicao_eventos_empresa ON public.vendas_expedicao_eventos(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendas_expedicao_eventos_expedicao ON public.vendas_expedicao_eventos(empresa_id, expedicao_id, created_at DESC);

ALTER TABLE public.vendas_expedicao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_expedicao_eventos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendas_expedicao_eventos_all_company_members ON public.vendas_expedicao_eventos;
CREATE POLICY vendas_expedicao_eventos_all_company_members
  ON public.vendas_expedicao_eventos
  FOR ALL
  TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendas_expedicao_eventos TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_vendas_expedicoes_autofill_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('enviado','entregue') AND NEW.data_envio IS NULL THEN
    NEW.data_envio := current_date;
  END IF;
  IF NEW.status = 'entregue' AND NEW.data_entrega IS NULL THEN
    NEW.data_entrega := current_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_vendas_expedicoes_autofill_dates ON public.vendas_expedicoes;
CREATE TRIGGER tg_vendas_expedicoes_autofill_dates
  BEFORE INSERT OR UPDATE ON public.vendas_expedicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vendas_expedicoes_autofill_dates();

CREATE OR REPLACE FUNCTION public.tg_vendas_expedicoes_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.vendas_expedicao_eventos(empresa_id, expedicao_id, tipo, de_status, para_status, mensagem, meta, created_by)
    VALUES (v_emp, NEW.id, 'created', NULL, NEW.status, 'Expedição criada', '{}'::jsonb, auth.uid());

    INSERT INTO public.vendas_expedicao_eventos(empresa_id, expedicao_id, tipo, de_status, para_status, mensagem, meta, created_by)
    VALUES (v_emp, NEW.id, 'status', NULL, NEW.status, 'Status definido', '{}'::jsonb, auth.uid());
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.vendas_expedicao_eventos(empresa_id, expedicao_id, tipo, de_status, para_status, mensagem, meta, created_by)
      VALUES (
        v_emp,
        NEW.id,
        'status',
        OLD.status,
        NEW.status,
        'Status atualizado',
        jsonb_build_object('old', OLD.status, 'new', NEW.status),
        auth.uid()
      );
    END IF;

    IF NEW.tracking_code IS DISTINCT FROM OLD.tracking_code THEN
      INSERT INTO public.vendas_expedicao_eventos(empresa_id, expedicao_id, tipo, de_status, para_status, mensagem, meta, created_by)
      VALUES (
        v_emp,
        NEW.id,
        'tracking',
        NULL,
        NULL,
        'Rastreio atualizado',
        jsonb_build_object('old', OLD.tracking_code, 'new', NEW.tracking_code),
        auth.uid()
      );
    END IF;

    IF NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
      INSERT INTO public.vendas_expedicao_eventos(empresa_id, expedicao_id, tipo, de_status, para_status, mensagem, meta, created_by)
      VALUES (
        v_emp,
        NEW.id,
        'observacoes',
        NULL,
        NULL,
        'Observações atualizadas',
        '{}'::jsonb,
        auth.uid()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_vendas_expedicoes_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_vendas_expedicoes_events() TO service_role;

DROP TRIGGER IF EXISTS tg_vendas_expedicoes_events ON public.vendas_expedicoes;
CREATE TRIGGER tg_vendas_expedicoes_events
  AFTER INSERT OR UPDATE ON public.vendas_expedicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vendas_expedicoes_events();

COMMIT;

