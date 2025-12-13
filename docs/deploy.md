# Deploy Checklist

Objetivo: garantir que o ambiente de produção fique **idêntico** ao ambiente dev testado.

## 1. Verificar migrations

```bash
supabase migration list
supabase migration list --db-url "$SUPABASE_DB_URL"
```

Os dois comandos devem mostrar a mesma lista de versões. Se existir diferença:

```bash
supabase migration up --db-url "$SUPABASE_DB_URL"
```

> **Nunca** use arquivos de `supabase/migrations_legacy`. Toda alteração válida precisa estar em `supabase/migrations/`.

## 2. Testar e gerar artefatos

```bash
npm ci
npm run lint
npm run test
npm run build
```

Somente avance se todos os testes passarem.

## 3. Publicar

1. Faça o deploy das migrations (com o comando acima).
2. Faça o upload do build (Netlify, Vercel ou servidor custom).
3. Faça smoke tests em produção: login, dashboard, módulo crítico (ex.: Recebimentos).

## 4. Pós-deploy

- Monitore logs do Supabase e do front.
- Caso um hotfix manual seja necessário no banco, crie uma migration oficial logo em seguida para manter o histórico limpo.

Seguindo esse checklist, evitamos divergências entre ambientes e garantimos reproduzir em produção o que foi validado em dev. 
