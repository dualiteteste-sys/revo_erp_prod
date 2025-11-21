/*
# Operation Name: Grant Public Read on Plans (Schema + Table)

Permite acesso de leitura pública (`SELECT`) à tabela `public.plans` para a landing page,
garantindo que os roles `anon` e `authenticated` tenham o mínimo necessário de privilégio
no schema `public` e na tabela de planos.

## Query Description:
- Concede `USAGE` no schema `public` para `anon` e `authenticated`.
- Concede `SELECT` na tabela `public.plans` para `anon` e `authenticated`.
- Não altera RLS nem concede permissão de escrita.

## Metadata:
- Schema-Category: "Safe"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (basta executar REVOKE equivalente)

## Structure Details:
- Schema afetado: `public`
- Tabela afetada: `public.plans`

## Security Implications:
- RLS Status: Inalterado (políticas existentes continuam válidas).
- Policy Changes: Nenhuma.
- Auth Requirements: `anon` e `authenticated` podem ler planos.

## Performance Impact:
- Indexes: Nenhum.
- Triggers: Nenhum.
- Estimated Impact: Desprezível.
*/

begin;

-- 1) Permitir que anon/authenticated possam "enxergar" objetos do schema public
grant usage on schema public to anon, authenticated;

-- 2) Permitir leitura da tabela de planos para a landing page (mantendo RLS ativo)
grant select on table public.plans to anon, authenticated;

commit;
