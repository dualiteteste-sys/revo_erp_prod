-- =============================================================================
-- TESTE CONTROLADO: Geração de eventos de auditoria em public.servicos
-- Fluxo: INSERT -> UPDATE -> DELETE (reversível; não deixa dado funcional)
-- Pré-requisito: trigger tg_audit_servicos (AFTER I/U/D FOR EACH ROW)
-- =============================================================================

DO $$
DECLARE
  v_emp  uuid;
  v_id   uuid := gen_random_uuid();
BEGIN
  -- 1) Resolve empresa ativa (em ambiente autenticado via PostgREST)
  v_emp := public.current_empresa_id();

  IF v_emp IS NULL THEN
    -- Fallback de segurança: usar a empresa já vinculada ao usuário (ajuste se necessário)
    v_emp := 'a0eb2230-a0b5-4f04-b5e5-6af75e34b4ae'::uuid;
  END IF;

  -- 2) INSERT (gera evento INSERT)
  INSERT INTO public.servicos (id, empresa_id, descricao, preco_venda, unidade)
  VALUES (v_id, v_emp, '[AUDIT-TEST] Serviço de teste', 10.00, 'UN');

  -- 3) UPDATE (gera evento UPDATE)
  UPDATE public.servicos
     SET descricao = '[AUDIT-TEST] Serviço de teste (v2)',
         preco_venda = 15.00
   WHERE id = v_id;

  -- 4) DELETE (gera evento DELETE)
  DELETE FROM public.servicos
   WHERE id = v_id;
END
$$ LANGUAGE plpgsql;

-- =========================
-- SMOKE CHECK (somente leitura)
-- =========================
-- A) Houve incremento de eventos?
-- SELECT count(*) AS total_events FROM audit.events;

-- B) Últimos 10 eventos (qualquer tabela) para inspeção rápida
-- SELECT occurred_at, source, table_name, op, actor_email, pk, meta
-- FROM audit.events
-- ORDER BY occurred_at DESC
-- LIMIT 10;

-- C) Últimos 10 eventos só de 'servicos'
-- SELECT occurred_at, source, table_name, op, actor_email, pk, diff
-- FROM audit.events
-- WHERE table_name = 'servicos'
-- ORDER BY occurred_at DESC
-- LIMIT 10;
