-- Fix: produto_fornecedor_link referencia "public.parceiros" que não existe
-- Bug P1: 27 ocorrências em prod (2026-03-20)
-- Root cause: RPC produto_fornecedor_link usa FROM public.parceiros,
--   mas a tabela correta é public.pessoas (parceiros foi nome provisório nunca criado).
--   Adicionalmente, produto_fornecedores.fornecedor_id tem FK para fornecedores(id)
--   (tabela legada), mas novos fornecedores são criados em pessoas.
-- Fix: (1) backfill fornecedores→pessoas, (2) migrar FK para pessoas, (3) corrigir RPC.

-- 1) Backfill: garantir que todo fornecedores.id exista em pessoas
DO $$
BEGIN
  IF to_regclass('public.fornecedores') IS NOT NULL THEN
    INSERT INTO public.pessoas (id, empresa_id, nome, tipo)
    SELECT f.id, f.empresa_id, f.nome, 'fornecedor'::public.pessoa_tipo
    FROM public.fornecedores f
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pessoas p WHERE p.id = f.id
    );

    -- Se já existe como cliente, promover para ambos
    UPDATE public.pessoas p
    SET tipo = 'ambos'::public.pessoa_tipo
    FROM public.fornecedores f
    WHERE f.id = p.id
      AND p.tipo = 'cliente'::public.pessoa_tipo;
  END IF;
END $$;

-- 2) Migrar FK de fornecedores(id) para pessoas(id)
ALTER TABLE public.produto_fornecedores
  DROP CONSTRAINT IF EXISTS produto_fornecedores_fornecedor_id_fkey;

ALTER TABLE public.produto_fornecedores
  ADD CONSTRAINT produto_fornecedores_fornecedor_id_fkey
  FOREIGN KEY (fornecedor_id) REFERENCES public.pessoas(id) ON DELETE RESTRICT;

-- 3) Corrigir RPC: parceiros → pessoas
CREATE OR REPLACE FUNCTION public.produto_fornecedor_link(
  p_produto_id uuid,
  p_fornecedor_nome text,
  p_codigo_no_fornecedor text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_fornecedor_id uuid;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa' USING errcode = '42501';
  END IF;

  -- Buscar fornecedor por nome (pessoas com tipo fornecedor/ambos)
  SELECT id INTO v_fornecedor_id
  FROM public.pessoas
  WHERE empresa_id = v_empresa_id
    AND lower(trim(nome)) = lower(trim(p_fornecedor_nome))
    AND tipo IN ('fornecedor', 'ambos')
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_fornecedor_id IS NULL THEN
    RETURN; -- fornecedor não encontrado, skip silencioso
  END IF;

  INSERT INTO public.produto_fornecedores (produto_id, fornecedor_id, empresa_id, codigo_no_fornecedor)
  VALUES (p_produto_id, v_fornecedor_id, v_empresa_id, p_codigo_no_fornecedor)
  ON CONFLICT (produto_id, fornecedor_id) DO UPDATE
    SET codigo_no_fornecedor = COALESCE(EXCLUDED.codigo_no_fornecedor, public.produto_fornecedores.codigo_no_fornecedor);
END;
$$;

REVOKE ALL ON FUNCTION public.produto_fornecedor_link(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.produto_fornecedor_link(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.produto_fornecedor_link(uuid, text, text) TO authenticated;
