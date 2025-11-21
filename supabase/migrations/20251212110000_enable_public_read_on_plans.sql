/*
# [RLS] Habilita leitura pública na tabela `plans`

## Query Description:
Esta operação habilita a segurança em nível de linha (RLS) para a tabela `public.plans` e cria uma política de `SELECT` que permite a qualquer visitante (anônimo ou autenticado) ler apenas os planos que estão marcados como `active = true`. Isso é essencial para exibir os planos de preços na landing page pública sem expor planos inativos ou internos. A operação é segura, não afeta dados existentes e não concede permissões de escrita.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Table: `public.plans`
- Policies: `"Habilita leitura pública para planos ativos"` (criada/substituída)

## Security Implications:
- RLS Status: Enabled
- Policy Changes: Yes, a `SELECT` policy is added for `anon` and `authenticated` roles.
- Auth Requirements: None for reading active plans.

## Performance Impact:
- Indexes: No changes. The query `active = true` would benefit from an index on the `active` column if the table grows very large.
- Triggers: No changes.
- Estimated Impact: Negligible performance impact.
*/

-- Habilita Row Level Security na tabela de planos.
alter table public.plans enable row level security;

-- Permite que qualquer pessoa (anônima ou autenticada) leia os planos que estão ativos.
drop policy if exists "Habilita leitura pública para planos ativos" on public.plans;
create policy "Habilita leitura pública para planos ativos"
  on public.plans for select
  to anon, authenticated
  using (active = true);
