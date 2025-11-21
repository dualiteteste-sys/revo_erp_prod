/*
# [Function] set_principal_product_image
Cria uma função RPC para definir uma imagem como principal para um produto, garantindo que apenas uma imagem seja principal por vez.

## Query Description:
- A função recebe um `produto_id` e um `imagem_id`.
- Primeiro, ela atualiza todas as imagens do produto para `principal = false`.
- Em seguida, atualiza a imagem específica para `principal = true`.
- Tudo é executado dentro de uma única transação, garantindo atomicidade.
- A função verifica se o usuário que a chama é membro da empresa proprietária do produto.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (a remoção da função reverte a mudança)

## Structure Details:
- Function: `public.set_principal_product_image(uuid, uuid)`

## Security Implications:
- RLS Status: A função respeita a RLS através da verificação `is_user_member_of`.
- Policy Changes: No
- Auth Requirements: O usuário deve estar autenticado e ser membro da empresa.

## Performance Impact:
- Indexes: A operação se beneficia de índices em `produto_imagens(produto_id)` e `produto_imagens(id)`.
- Triggers: No
- Estimated Impact: Baixo, a operação é rápida e afeta poucas linhas por vez.
*/

CREATE OR REPLACE FUNCTION public.set_principal_product_image(
    p_produto_id uuid,
    p_imagem_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa_id uuid;
BEGIN
    -- Obter o empresa_id do produto para verificação de segurança
    SELECT empresa_id INTO v_empresa_id FROM produtos WHERE id = p_produto_id;

    -- Verificar se o produto existe e se o usuário tem permissão
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Produto com ID % não encontrado.', p_produto_id;
    END IF;

    IF NOT is_user_member_of(v_empresa_id) THEN
        RAISE EXCEPTION 'O usuário não tem permissão para modificar este produto.';
    END IF;

    -- Garantir que a imagem pertence ao produto e à empresa
    IF NOT EXISTS (
        SELECT 1 FROM produto_imagens
        WHERE id = p_imagem_id AND produto_id = p_produto_id AND empresa_id = v_empresa_id
    ) THEN
        RAISE EXCEPTION 'Imagem com ID % não pertence ao produto %.', p_imagem_id, p_produto_id;
    END IF;

    -- Atualizar todas as imagens do produto para não serem principais
    UPDATE produto_imagens
    SET principal = false
    WHERE produto_id = p_produto_id AND empresa_id = v_empresa_id;

    -- Definir a imagem especificada como principal
    UPDATE produto_imagens
    SET principal = true
    WHERE id = p_imagem_id AND empresa_id = v_empresa_id;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.set_principal_product_image(uuid, uuid) TO authenticated;
