-- =============================================================================
-- Fix: Compras (OC) fornecedor_id deve referenciar public.pessoas (não public.fornecedores)
-- Motivo:
-- - O autocomplete/RPC `search_suppliers_for_current_user` retorna `public.pessoas.id`
-- - Porém alguns ambientes ainda tinham FK em `compras_pedidos.fornecedor_id -> fornecedores(id)`
--   causando erro 23503 ao salvar a OC / aplicar sugestões.
-- Estratégia:
-- 1) Backfill: garante que qualquer `fornecedores.id` existente também exista em `pessoas.id`
--    (mantém o mesmo UUID para preservar referências já gravadas).
-- 2) Troca a FK para `public.pessoas(id)`.
-- =============================================================================

BEGIN;

-- 1) Backfill fornecedores -> pessoas (mínimo necessário)
-- (Nem todos os ambientes possuem `public.fornecedores`; em DBs novas, tudo já é baseado em `pessoas`.)
DO $$
BEGIN
  IF to_regclass('public.fornecedores') IS NOT NULL THEN
    INSERT INTO public.pessoas (id, empresa_id, nome, tipo)
    SELECT f.id, f.empresa_id, f.nome, 'fornecedor'::public.pessoa_tipo
    FROM public.fornecedores f
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.pessoas p
      WHERE p.id = f.id
    );

    -- Se por alguma razão existir o mesmo id em pessoas como "cliente", promove para "ambos".
    UPDATE public.pessoas p
    SET tipo = 'ambos'::public.pessoa_tipo
    FROM public.fornecedores f
    WHERE f.id = p.id
      AND p.tipo = 'cliente'::public.pessoa_tipo;
  END IF;
END $$;

-- 2) Troca FK do pedido para apontar para pessoas
-- (Em ambientes onde o módulo de compras ainda não foi criado, evita quebrar a aplicação das migrations.)
DO $$
BEGIN
  IF to_regclass('public.compras_pedidos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.compras_pedidos DROP CONSTRAINT IF EXISTS compras_pedidos_fornecedor_fkey';
    EXECUTE 'ALTER TABLE public.compras_pedidos ADD CONSTRAINT compras_pedidos_fornecedor_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.pessoas(id) ON DELETE RESTRICT';
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
