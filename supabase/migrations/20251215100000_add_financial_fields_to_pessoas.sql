/*
# [DDL] Adiciona campos financeiros à tabela de pessoas
Adiciona colunas para limite de crédito, condição de pagamento e informações bancárias na tabela `public.pessoas`.

## Query Description:
Esta operação adiciona três novas colunas à tabela `public.pessoas`.
- `limite_credito`: Armazena o limite de crédito do parceiro.
- `condicao_pagamento`: Armazena as condições de pagamento acordadas.
- `informacoes_bancarias`: Armazena dados bancários para pagamentos.
A operação é segura e não afeta dados existentes, pois as colunas são adicionadas como `NULLABLE`.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (DROP COLUMN)

## Structure Details:
- Tabela afetada: `public.pessoas`
- Colunas adicionadas: `limite_credito`, `condicao_pagamento`, `informacoes_bancarias`

## Security Implications:
- RLS Status: As novas colunas serão cobertas pelas políticas de RLS existentes na tabela `public.pessoas`. Nenhuma alteração de política é necessária.
- Policy Changes: No
- Auth Requirements: N/A

## Performance Impact:
- Indexes: Nenhum índice adicionado.
- Triggers: Nenhum trigger novo.
- Estimated Impact: Baixo.
*/

ALTER TABLE public.pessoas
ADD COLUMN IF NOT EXISTS limite_credito numeric(15, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS condicao_pagamento text,
ADD COLUMN IF NOT EXISTS informacoes_bancarias text;
