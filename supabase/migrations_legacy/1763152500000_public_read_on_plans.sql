/*
# [Feature] Public Pricing Page
Permite que a página de preços pública (landing page) leia os planos de assinatura disponíveis.

## Query Description:
Esta operação habilita a Segurança em Nível de Linha (RLS) na tabela `plans` e cria uma política que permite que qualquer pessoa (incluindo visitantes anônimos) leia os dados dos planos. Isso é necessário para que a página de preços possa exibir os planos disponíveis antes do login do usuário. A operação é segura, pois apenas concede permissão de leitura (`SELECT`) e não permite modificações.

## Metadata:
- Schema-Category: "Safe"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (basta remover a política e desabilitar o RLS)

## Structure Details:
- Tabela afetada: `public.plans`

## Security Implications:
- RLS Status: Habilitado na tabela `plans`.
- Policy Changes: Adiciona uma nova política de `SELECT` pública.
- Auth Requirements: Nenhuma. Acesso é anônimo.

## Performance Impact:
- Indexes: Nenhum.
- Triggers: Nenhum.
- Estimated Impact: Nenhum impacto de performance esperado, pois a tabela `plans` é pequena.
*/

-- Habilita a segurança em nível de linha para a tabela de planos.
-- É um pré-requisito para que as políticas de segurança sejam aplicadas.
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Remove a política de leitura pública se ela já existir, garantindo que o script seja idempotente.
DROP POLICY IF EXISTS "Allow public read access to plans" ON public.plans;

-- Cria uma nova política que permite a qualquer usuário (incluindo anônimos)
-- ler (`SELECT`) todos os registros da tabela de planos.
CREATE POLICY "Allow public read access to plans"
ON public.plans
FOR SELECT
USING (true);
