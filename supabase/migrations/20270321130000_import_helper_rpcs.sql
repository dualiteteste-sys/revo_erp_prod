-- Helper RPCs para import CSV completo de produtos
-- Necessários: marcas upsert/search, produto lookup by SKU

-- 1) marcas_find_or_create: busca por nome (case-insensitive), cria se não existir
CREATE OR REPLACE FUNCTION public.marcas_find_or_create(p_nome text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa' USING errcode = '42501';
  END IF;

  SELECT id INTO v_id
  FROM public.marcas
  WHERE empresa_id = v_empresa_id
    AND lower(trim(nome)) = lower(trim(p_nome))
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.marcas (empresa_id, nome)
  VALUES (v_empresa_id, trim(p_nome))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcas_find_or_create(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcas_find_or_create(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.marcas_find_or_create(text) TO authenticated;

-- 2) produtos_find_by_sku: busca produto por SKU na empresa atual
CREATE OR REPLACE FUNCTION public.produtos_find_by_sku(p_sku text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa' USING errcode = '42501';
  END IF;

  SELECT id INTO v_id
  FROM public.produtos
  WHERE empresa_id = v_empresa_id
    AND lower(trim(sku)) = lower(trim(p_sku))
    AND deleted_at IS NULL
  LIMIT 1;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_find_by_sku(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.produtos_find_by_sku(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.produtos_find_by_sku(text) TO authenticated;

-- 3) produto_fornecedor_link: vincula fornecedor a produto (idempotente)
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

  -- Buscar fornecedor por nome (parceiros com tipo fornecedor/ambos)
  SELECT id INTO v_fornecedor_id
  FROM public.parceiros
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
