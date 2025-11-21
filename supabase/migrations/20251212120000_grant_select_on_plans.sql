/*
# Operation Name: Grant Public Read on Plans
Permite acesso de leitura pública (`SELECT`) à tabela `plans` para usuários anônimos e autenticados. As políticas de Segurança em Nível de Linha (RLS) existentes continuarão a controlar quais linhas específicas são visíveis.

## Query Description:
Esta operação concede acesso de apenas leitura à lista de planos de assinatura. É uma operação segura, pois não expõe dados sensíveis e depende das políticas de RLS existentes para a filtragem de dados.

## Metadata:
- Schema-Category: "Safe"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Afeta as permissões da tabela: public.plans

## Security Implications:
- RLS Status: Inalterado (depende do RLS existente)
- Policy Changes: Não
- Auth Requirements: Concede acesso às roles 'anon' e 'authenticated'

## Performance Impact:
- Indexes: Nenhum
- Triggers: Nenhum
- Estimated Impact: Insignificante
*/

-- Grants: permitir SELECT para anon e authenticated (RLS continua controlando as linhas)
grant usage on schema public to anon, authenticated;
grant select on table public.plans to anon, authenticated;
