/*
# [Schema] produto_imagens
Cria a tabela para armazenar as imagens dos produtos e configura o bucket de armazenamento e as políticas de segurança (RLS).

## Query Description:
- Cria a tabela `produto_imagens` para associar URLs de imagens a produtos.
- Adiciona um bucket no Supabase Storage chamado `product_images` para armazenar os arquivos.
- Define políticas de segurança (RLS) que garantem que:
  1. Usuários só possam ver as imagens dos produtos das empresas às quais pertencem.
  2. Usuários só possam inserir, atualizar ou deletar imagens de produtos das empresas às quais pertencem.
- As políticas de armazenamento garantem que os arquivos sejam salvos em pastas segregadas por `empresa_id`.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (a remoção da tabela e do bucket reverte a mudança)

## Structure Details:
- Table: `public.produto_imagens`
- Storage Bucket: `product_images`

## Security Implications:
- RLS Status: Enabled
- Policy Changes: Yes (novas políticas para `produto_imagens` e `product_images` bucket)
- Auth Requirements: O usuário deve estar autenticado e ser membro da empresa.

## Performance Impact:
- Indexes: Chaves primárias e estrangeiras são indexadas por padrão.
- Triggers: No
- Estimated Impact: Baixo.
*/

-- 1. Tabela para armazenar metadados das imagens
CREATE TABLE IF NOT EXISTS public.produto_imagens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    url text NOT NULL,
    ordem integer NOT NULL DEFAULT 0,
    principal boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Trigger para `updated_at`
CREATE TRIGGER set_produto_imagens_updated_at
BEFORE UPDATE ON public.produto_imagens
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Bucket de armazenamento
INSERT INTO storage.buckets (id, name, public)
VALUES ('product_images', 'product_images', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Políticas de RLS para a tabela
ALTER TABLE public.produto_imagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver imagens de suas empresas" ON public.produto_imagens;
CREATE POLICY "Usuários podem ver imagens de suas empresas"
ON public.produto_imagens FOR SELECT
USING (is_user_member_of(empresa_id));

DROP POLICY IF EXISTS "Usuários podem inserir imagens em suas empresas" ON public.produto_imagens;
CREATE POLICY "Usuários podem inserir imagens em suas empresas"
ON public.produto_imagens FOR INSERT
WITH CHECK (is_user_member_of(empresa_id));

DROP POLICY IF EXISTS "Usuários podem atualizar imagens de suas empresas" ON public.produto_imagens;
CREATE POLICY "Usuários podem atualizar imagens de suas empresas"
ON public.produto_imagens FOR UPDATE
USING (is_user_member_of(empresa_id));

DROP POLICY IF EXISTS "Usuários podem deletar imagens de suas empresas" ON public.produto_imagens;
CREATE POLICY "Usuários podem deletar imagens de suas empresas"
ON public.produto_imagens FOR DELETE
USING (is_user_member_of(empresa_id));

-- 5. Políticas de RLS para o bucket
DROP POLICY IF EXISTS "Permite acesso de leitura público" ON storage.objects;
CREATE POLICY "Permite acesso de leitura público"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product_images' );

DROP POLICY IF EXISTS "Permite upload para membros da empresa" ON storage.objects;
CREATE POLICY "Permite upload para membros da empresa"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product_images' AND
  is_user_member_of((storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "Permite update para membros da empresa" ON storage.objects;
CREATE POLICY "Permite update para membros da empresa"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product_images' AND
  is_user_member_of((storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "Permite delete para membros da empresa" ON storage.objects;
CREATE POLICY "Permite delete para membros da empresa"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product_images' AND
  is_user_member_of((storage.foldername(name))[1]::uuid)
);
