-- =============================================================================
-- Migração: Remover triggers extras de updated_at (manter só tg_set_updated_at)
-- Data: 2025-11-07
-- Alvo (conforme diagnóstico): 
--   public.ordem_servico_itens (2 extras), public.ordem_servicos (1 extra),
--   public.pessoa_contatos (1 extra), public.pessoa_enderecos (1 extra),
--   public.produto_fornecedores (1 extra)
-- Segurança: idempotente; não altera dados; só dropa triggers duplicados.
-- =============================================================================

DO $$
DECLARE
  v_touch_oid  oid := 'public.touch_updated_at()'::regproc::oid;
  v_legacy_oid oid := to_regprocedure('public.tg_set_updated_at()')::oid; -- pode ser NULL
  r RECORD;
BEGIN
  FOR r IN 
    SELECT t.schemaname, t.tablename, t.trigger_name
    FROM (
      VALUES 
        ('public','ordem_servico_itens' , NULL),
        ('public','ordem_servicos'      , NULL),
        ('public','pessoa_contatos'     , NULL),
        ('public','pessoa_enderecos'    , NULL),
        ('public','produto_fornecedores', NULL)
    ) AS target(schemaname, tablename, _)
    JOIN LATERAL (
      SELECT tg.tgname AS trigger_name, tg.tgfoid
      FROM pg_trigger tg
      WHERE tg.tgrelid = to_regclass(format('%I.%I', target.schemaname, target.tablename))
        AND NOT tg.tgisinternal
        AND tg.tgname &lt;&gt; 'tg_set_updated_at'
    ) t ON TRUE
  LOOP
    -- Dropa SOMENTE se o trigger chamar a função correta ou a legacy de updated_at
    IF r.trigger_name IS NOT NULL AND (
         r.trigger_name IN (
           -- muitas vezes o nome não revela a função; validamos pelo tgfoid abaixo
           -- aqui não usamos nome para decisão, apenas foid
         )
       OR EXISTS (
           SELECT 1
           FROM pg_trigger tg
           WHERE tg.tgname = r.trigger_name
             AND tg.tgfoid = v_touch_oid
       )
       OR (v_legacy_oid IS NOT NULL AND EXISTS (
           SELECT 1
           FROM pg_trigger tg
           WHERE tg.tgname = r.trigger_name
             AND tg.tgfoid = v_legacy_oid
       ))
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.trigger_name, r.schemaname, r.tablename);
    END IF;
  END LOOP;

  PERFORM pg_notify('app_log', '[TRIGGER] cleaned extras on: ordem_servico_itens, ordem_servicos, pessoa_contatos, pessoa_enderecos, produto_fornecedores');
END
$$ LANGUAGE plpgsql;
