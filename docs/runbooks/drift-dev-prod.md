# Runbook — DRIFT (DEV ≠ PROD)

Este runbook cobre a Issue criada quando `Compare DEV vs PROD schema (public)` detecta divergência.

## 1) Identificar a fonte (DEV ou PROD)
- Se a Issue veio de `main`: PROD está diferente do que deveria estar em produção.
- Se veio de `dev`: PROD está diferente do DEV atual.

## 2) O que fazer
1) Baixar o artifact do workflow (diff).
2) Converter o “complemento” em migrations versionadas em `supabase/migrations/`.
3) Garantir que `verify:migrations` passe (clean slate).
4) PR `dev → main` e merge apenas com checks verdes.

## 3) O que nunca fazer (para não voltar drift)
- Não aplicar SQL “na mão” em PROD (dashboard/SQL editor) sem virar migration.

