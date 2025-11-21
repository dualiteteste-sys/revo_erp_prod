/*
# [FIX] Corrige a assinatura da função search_items_for_os

## Query Description: [Esta operação corrige um erro de migração anterior recriando a função `search_items_for_os`. A função antiga é removida e uma nova é criada com a assinatura correta e as configurações de segurança recomendadas, incluindo o `search_path`.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [false]

## Structure Details:
- Dropped: `FUNCTION search_items_for_os(text, integer)`
- Created: `FUNCTION search_items_for_os(p_search text, p_limit integer)`

## Security Implications:
- RLS Status: [N/A]
- Policy Changes: [No]
- Auth Requirements: [authenticated]

## Performance Impact:
- Indexes: [N/A]
- Triggers: [N/A]
- Estimated Impact: [Nenhum impacto negativo. A função continua utilizando índices existentes em `produtos` e `servicos`.]
*/

-- Remove a função antiga com a assinatura que causou o erro.
DROP FUNCTION IF EXISTS public.search_items_for_os(text, integer);

-- Recria a função com a assinatura correta e as configurações de segurança.
CREATE FUNCTION public.search_items_for_os(
  p_search text,
  p_limit integer
)
RETURNS TABLE(id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM (
      -- Busca em Produtos
      SELECT
        p.id,
        'product'::text AS type,
        p.nome AS descricao,
        p.sku AS codigo,
        p.preco_venda
      FROM public.produtos p
      WHERE
        p.empresa_id = public.current_empresa_id() AND
        (p.nome ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%')
      
      UNION ALL

      -- Busca em Serviços
      SELECT
        s.id,
        'service'::text AS type,
        s.descricao,
        s.codigo,
        s.preco_venda::numeric
      FROM public.servicos s
      WHERE
        s.empresa_id = public.current_empresa_id() AND
        (s.descricao ILIKE '%' || p_search || '%' OR s.codigo ILIKE '%' || p_search || '%')
    ) AS combined_results
    ORDER BY combined_results.descricao
    LIMIT p_limit;

END;
$$;

-- Regra 5: Garante que apenas usuários autenticados possam executar a função.
REVOKE ALL ON FUNCTION public.search_items_for_os(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_items_for_os(text, integer) TO authenticated;
