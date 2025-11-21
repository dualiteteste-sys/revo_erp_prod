/*
          # [Operation Name]
          Melhoria no Autocomplete de Itens da O.S.

          [Description of what this operation does]
          Esta migração substitui duas funções RPC (`search_products_for_current_user` e `search_services_for_current_user`) por uma única função otimizada (`search_items_for_os`). A nova função unifica a busca por produtos e serviços para o autocompletar da Ordem de Serviço, retornando um resultado estruturado e consistente.

          ## Query Description: [Write a clear, informative message that:
          1. Explains the impact on existing data
          2. Highlights potential risks or safety concerns
          3. Suggests precautions (e.g., backup recommendations)
          4. Uses non-technical language when possible
          5. Keeps it concise but comprehensive
          Example: "This operation will modify user account structures - backup recommended. Changes affect login data and may require application updates."]
          Esta operação substitui funções existentes por uma nova, o que pode quebrar a funcionalidade do frontend se a aplicação não for atualizada para usar a nova função `search_items_for_os`. Nenhuma tabela ou dado de usuário é modificado.

          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: true

          ## Structure Details:
          - Funções Removidas: `search_products_for_current_user`, `search_services_for_current_user`
          - Função Adicionada: `search_items_for_os(p_search TEXT, p_limit INT)`

          ## Security Implications:
          - RLS Status: N/A (Funções RPC)
          - Policy Changes: No
          - Auth Requirements: A nova função continua a operar dentro do contexto do usuário autenticado e sua empresa ativa, mantendo as mesmas garantias de segurança.

          ## Performance Impact:
          - Indexes: A performance depende dos índices existentes nas colunas de busca das tabelas `produtos` e `servicos`.
          - Triggers: N/A
          - Estimated Impact: A unificação das buscas em uma única chamada RPC deve reduzir a latência do lado do cliente.
          */

-- 1. Remover as funções antigas que serão substituídas
DROP FUNCTION IF EXISTS public.search_products_for_current_user(p_search text, p_limit integer);
DROP FUNCTION IF EXISTS public.search_services_for_current_user(p_search text, p_limit integer);

-- 2. Criar a nova função unificada
CREATE OR REPLACE FUNCTION public.search_items_for_os(p_search text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
SET search_path = pg_catalog, public;

(
    SELECT
        p.id,
        'product' AS type,
        p.nome AS descricao,
        p.sku AS codigo,
        p.preco_venda
    FROM public.produtos p
    WHERE p.empresa_id = public.current_empresa_id()
      AND p.status = 'ativo'
      AND p.permitir_inclusao_vendas = TRUE
      AND (p_search IS NULL OR p.nome ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%')
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
    WHERE s.empresa_id = public.current_empresa_id()
      AND s.status = 'ativo'
      AND (p_search IS NULL OR s.descricao ILIKE '%' || p_search || '%' OR s.codigo ILIKE '%' || p_search || '%')
)
ORDER BY descricao
LIMIT p_limit;
$function$;

-- 3. Revogar permissões e conceder novamente para garantir a segurança
REVOKE ALL ON FUNCTION public.search_items_for_os(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_items_for_os(text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_items_for_os(text, integer)
IS 'Busca unificada por produtos e serviços para o autocomplete da Ordem de Serviço, respeitando o contexto da empresa ativa.';
