# Manual para leigos: como evitar DEV ≠ PROD (Supabase + GitHub)

Este manual é um “jeito simples” de operar o banco (Supabase) e o código (GitHub) sem deixar DEV e PROD divergirem de novo.

## 1) A analogia (pra nunca esquecer)

Pense assim:

- **DEV = cozinha de testes**: você experimenta receitas, erra sem medo, muda ingredientes, joga fora e recomeça.
- **PROD = restaurante aberto**: aqui só entra receita **testada e aprovada**. Mudanças são controladas.
- **Migrations = recibos/nota fiscal da receita**: é o “passo a passo” que permite refazer a mesma receita em qualquer cozinha (DEV/PROD/DR) com o mesmo resultado.
- **Branch `dev` = rascunho da receita**; **branch `main` = receita oficial do restaurante**.

Se alguém muda algo direto no restaurante (PROD) sem atualizar a receita oficial (migrations em `main`), cedo ou tarde dá problema: DEV e PROD ficam diferentes e o sistema quebra em módulos aleatórios.

## 2) Regra de ouro

**Tudo que muda o banco deve virar migration versionada no Git**.

Não importa se é:
- tabela/coluna
- função RPC
- view
- trigger
- policy (RLS)
- enum
- índice

Se mudou no banco e não está em migration, **a mudança é “fantasma”** (não viaja para PROD, DR, reset, etc.).

## 3) O que nunca fazer (para evitar drift)

**Em PROD:**
- Não criar/editar funções, tabelas, views, policies pelo dashboard do Supabase “na mão”.
- Não aplicar SQL manual “rápido só pra consertar”.

**Por quê?**
Porque isso vira uma mudança que **não está no `main`**, e você perde o histórico (migrations). Depois você reseta/replica e “some” de novo.

Se precisar “urgente”: faça do jeito certo (Seção 8: Emergência).

## 4) Como é o fluxo correto (o “caminho feliz”)

### Passo a passo

1) **Trabalhar no `dev`**
   - Implementa feature no app.
   - Cria/ajusta migration em `supabase/migrations/*`.

2) **Validar localmente (quando possível)**
   - Rodar `supabase start`
   - Rodar `supabase db reset` (banco do zero) e ver se aplica sem erro.

3) **Subir para GitHub**
   - Commit na branch `dev`.
   - Abrir PR `dev → main`.

4) **Deixar o CI barrar coisas perigosas**
   - O workflow `CI/CD Pipeline` valida que um banco “zerado” consegue aplicar tudo (clean slate).
   - Se falhar, não mergeia.

5) **Deploy para PROD apenas via `main`**
   - Merge no `main` dispara o pipeline que aplica migrations em PROD.

Resumo: **a única porta de entrada do PROD é o `main`**.

## 5) Como usar os workflows (explicado como leigo)

### 5.1 “Compare DEV vs PROD schema (public)”

Use como um “raio-x” para descobrir se os dois bancos estão iguais.

Escolha de branch:
- Rode no **`main`** quando a pergunta for: **“o que está em PROD bate com o que deveria estar em produção?”**
- Rode no **`dev`** quando a pergunta for: **“PROD está igual ao meu DEV agora?”**

Como interpretar:
- Se falhar com “drift detected”, significa: **há diferença real** (schema, storage, histórico de migrations).

### 5.2 “CI/CD Pipeline”

Pense como um “teste de receita do zero”:
- ele cria um banco limpo
- aplica todas migrations
- se alguma migration estiver quebrada, ele acusa antes de ir para PROD

Se isso passar sempre, você reduz muito a chance de drift e deploy quebrado.

### 5.3 “Reset PROD (Destrutivo)”

Isso é “fechar o restaurante e reconstruir a cozinha”.

Use apenas quando:
- não há clientes/dados importantes, **ou**
- você aceita perder o schema atual e recriar tudo via migrations

**Nunca** trate como operação do dia a dia.

## 6) Checklist de operação (o que fazer sempre)

### Antes de mergear `dev → main`
- [ ] Toda mudança no banco está em migration?
- [ ] O `CI/CD Pipeline` passou?
- [ ] Se criou/alterou RPC, você testou do app (ou via chamada RPC)?

### Depois que o `main` fez deploy em PROD
- [ ] Rodar `Compare DEV vs PROD schema` (semanalmente ou por mudança grande).
- [ ] Abrir o app em PROD e verificar os módulos críticos (ex.: RPCs principais).

## 7) Sinais clássicos de que voltou a ter drift

No console do app (PROD):
- `HTTP_404: Could not find the function ... in the schema cache`  
  Normalmente significa: **RPC não existe em PROD** (ou não foi exposta/atualizada).
- `400 Bad Request` em `/rest/v1/rpc/...`  
  Normalmente significa: **assinatura diferente** (parâmetros/nome/tipo) ou erro interno no SQL.

Quando aparecer:
1) Rode o workflow “Compare DEV vs PROD schema”.
2) Se o diff mostrar função/view/policy faltando em PROD, **vira migration**.

## 8) Procedimento de emergência (quando “quebrou em PROD”)

Analogia: “o restaurante está com um prato quebrando; você precisa consertar sem inventar moda”.

### Regra de emergência
Mesmo em emergência: **não faça SQL manual em PROD**.

### Passo a passo recomendado
1) **Reproduzir no DEV**
   - Conserta no DEV primeiro (ou em um branch).
2) **Criar migration**
   - Ex.: `supabase/migrations/YYYYMMDDHHMMSS_fix_*.sql`
3) **PR e merge**
   - `dev → main` com CI passando.
4) **Deixar pipeline aplicar em PROD**
   - Assim a correção fica “oficial” e repetível.

Se o PROD estiver completamente fora de controle e sem dados importantes:
- usar `Reset PROD (Destrutivo)` para alinhar tudo via migrations.

## 9) Como evitar “mudança fantasma” (a causa nº1 do drift)

Mudança fantasma é quando alguém:
- cria uma função RPC no dashboard
- testa e “funciona”
- mas não cria migration

Depois:
- reseta DEV, repara DR, roda pipeline… e **a função some**

### Solução prática
Crie uma regra interna:
> “Se foi criado no dashboard, tem que virar migration no mesmo dia.”

## 10) Recomendações “enterprise” simples (sem complicar)

1) **PROD protegido por ambiente**
   - Exigir aprovação (reviewers) para jobs com `environment: production`.

2) **Comparação agendada**
   - Agendar o workflow de diff (cron semanal/diário).

3) **Um dono da chave**
   - Definir quem pode rodar `reset-prod.yml`.

4) **Sem pressa em PROD**
   - Se quer testar coisas “rápidas”, faça no DEV, nunca em PROD.

## 11) Glossário rápido

- **Schema**: “estrutura” do banco (tabelas, funções, views, policies).
- **RPC**: função do Postgres chamada pelo app via API (`/rest/v1/rpc/...`).
- **RLS/Policy**: regras de segurança do banco (quem pode ver/editar).
- **Drift**: quando DEV e PROD não estão iguais no schema/histórico.
- **Migration**: arquivo SQL versionado que descreve mudanças no banco.

