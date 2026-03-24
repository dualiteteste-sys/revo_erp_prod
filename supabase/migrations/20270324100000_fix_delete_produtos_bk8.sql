-- ============================================================
-- Data fix: delete ALL products for BK8 IMPORTAÇÃO E EXPORTAÇÃO
-- empresa_id = 81c43bb8-197e-4bb0-b970-1bf8d2ba1bd4
-- Reason: products were imported with children as parents;
--         client has ZERO sales, so safe to wipe and reimport.
-- ============================================================

DO $$
DECLARE
  v_empresa_id uuid := '81c43bb8-197e-4bb0-b970-1bf8d2ba1bd4';
  v_count      int;
BEGIN
  -- ── Safety: abort if there are any sales referencing these products ──
  SELECT count(*) INTO v_count
    FROM vendas_itens_pedido vip
    JOIN produtos p ON p.id = vip.produto_id
   WHERE p.empresa_id = v_empresa_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'ABORT: found % vendas_itens_pedido rows for this empresa — cannot delete', v_count;
  END IF;

  -- ── Delete from RESTRICT FK tables (should be empty) ──
  DELETE FROM compras_pedido_itens
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_ordens_componentes
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_ordens
   WHERE produto_final_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_ordem_componentes
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_benef_componentes
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_boms_componentes
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_boms
   WHERE produto_final_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_roteiros
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_producao_componentes
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_producao_ordens
   WHERE produto_final_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM industria_materiais_cliente
   WHERE produto_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  DELETE FROM produto_componentes
   WHERE componente_id IN (SELECT id FROM produtos WHERE empresa_id = v_empresa_id);

  -- ── Delete products (CASCADE handles: imagens, atributos, fornecedores,
  --    tags, anuncios, codigos_barras, estoque_lotes, estoque_movimentos,
  --    qualidade_planos, mrp_parametros, mrp_demandas, kit components) ──
  -- produto_pai_id is ON DELETE SET NULL, so single DELETE works fine.
  DELETE FROM produtos WHERE empresa_id = v_empresa_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % products for empresa %', v_count, v_empresa_id;
END $$;
