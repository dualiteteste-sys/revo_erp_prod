# Playbook: alinhar Supabase DEV ↔ PROD

Este playbook é pensado para o cenário atual (sem clientes/dados críticos) e para reduzir “drift” entre projetos Supabase.

## 1) Rodar diagnóstico (drift)

No GitHub, execute o workflow:

- `.github/workflows/compare-dev-prod-schema.yml`

Ele gera artifacts com diffs de:

- `public` (tabelas/colunas, policies, triggers, views, assinaturas de funções)
- `storage` (buckets + policies em `storage.objects`)
- histórico aplicado (`supabase_migrations.schema_migrations`)

## 2) Se o PROD estiver faltando coisas

Opção recomendada (sem preocupação com dados):

- Rodar o workflow destrutivo `.github/workflows/reset-prod.yml` com `confirm=RESETAR-PROD`.
- Ele recria `public`, limpa `supabase_migrations.schema_migrations`, reaplica todas as migrations do repo e (se configurado) faz deploy das Edge Functions.

Se você quiser evitar reset destrutivo:

- Garanta que todas as migrations relevantes estão no Git (incluindo arquivos em `supabase/migrations`).
- Faça merge/push para `main` para o pipeline aplicar em PROD.

## 3) Edge Functions (muito comum “DEV ok / PROD quebra”)

O app chama funções via `supabase.functions.invoke(...)`. Se elas não estiverem deployadas no projeto PROD, o frontend vai falhar mesmo com o banco OK.

Para habilitar deploy automático (main e reset-prod), configure no GitHub Secrets:

- `SUPABASE_ACCESS_TOKEN` (token da Supabase com permissão de deploy)
- `SUPABASE_PROJECT_REF_PROD` (Project Ref do projeto REVO-PROD)

Deploy é feito por `scripts/deploy_edge_functions.sh`.

