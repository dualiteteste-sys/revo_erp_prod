# Multi-tenant — Tenant Resolution (anti-leak)

Objetivo: documentar, de forma auditável, como o Revo resolve o tenant **por requisição** e quais invariantes impedem vazamento entre empresas.

## 1) Conceitos e termos

- **Tenant**: `empresa_id`.
- **Membership**: usuário pertence à empresa (ex.: `empresa_usuarios` / regra equivalente).
- **Header tenant**: `x-empresa-id` enviado pelo frontend em cada requisição.
- **GUC**: variável de sessão do Postgres (`app.current_empresa_id`) usada pelo RLS.
- **PostgREST pre-request hook**: configuração `pgrst.db_pre_request` que executa uma função **antes** de qualquer query de uma requisição.

## 2) Fluxo “Estado da Arte” (alto nível)

1) Frontend define a empresa ativa.
2) Frontend envia `x-empresa-id` em toda chamada RPC/REST.
3) PostgREST executa `public._resolve_tenant_for_request()` no início de cada requisição (via `pgrst.db_pre_request`).
4) `_resolve_tenant_for_request()`:
   - limpa qualquer tenant anterior,
   - valida `x-empresa-id` e membership,
   - define `app.current_empresa_id` **LOCAL** (transaction-local),
   - faz fallback seguro para a empresa preferida do usuário quando necessário.
5) RLS usa `public.current_empresa_id()` para filtrar por empresa.

## 3) Funções centrais e garantias

### 3.1 `public._resolve_tenant_for_request()`

Fonte: migrations.

Invariantes obrigatórios:
- Sempre começar limpando `app.current_empresa_id` **no escopo da transação**:
  - `set_config('app.current_empresa_id', '', true)`
- Aceitar `x-empresa-id` somente se:
  - é UUID válido, e
  - `public.is_user_member_of(x_empresa_id)` é `true`
- Definir tenant somente com `set_config(..., true)` (LOCAL).  
  RISCO se usar `false`: **pode vazar tenant em pool**.

Migration canônica (fix definitivo):
- `supabase/migrations/20270127120000_fix_tenant_resolution_local_membership.sql`

Migrations históricas (contexto):
- `supabase/migrations/20270126210000_fix_tenant_leakage_header.sql` (header-first em `current_empresa_id()`)
- `supabase/migrations/20270126230000_fix_tenant_resolution_definitive.sql` (primeira versão do pre-request, com risco de `set_config(..., false)`)

### 3.2 `public.current_empresa_id()`

Responsável por dizer “qual tenant está ativo agora” para políticas RLS e funções.

Invariantes desejados:
- Prioriza `x-empresa-id` quando presente e válido (com validação de membership).
- Se não houver header, usa `app.current_empresa_id` (GUC).
- Fallback legível: empresa preferida do usuário (quando aplicável).

Migration de referência:
- `supabase/migrations/20270126210000_fix_tenant_leakage_header.sql`

## 4) Config PostgREST (pgrst.db_pre_request)

Invariante:
- `pgrst.db_pre_request` deve estar configurado para rodar `public._resolve_tenant_for_request` em:
  - `authenticated`
  - `anon`
  - `service_role`

Como validar (SQL):
```sql
select
  rolname,
  rolconfig
from pg_roles
where rolname in ('anon','authenticated','service_role');
```

RISCO:
- Se algum role não tiver o hook, uma rota pode executar queries com tenant “stale”.

## 5) Como validar anti-leak (check mínimo)

### 5.1 Teste manual (duas abas)

1) Login com usuário que tem acesso a duas empresas.
2) Aba A: selecione Empresa 1, abra Produtos, anote 1 SKU.
3) Aba B: selecione Empresa 2, abra Produtos, confirme que o SKU da Empresa 1 não aparece.
4) Alternar rapidamente entre abas e repetir 2–3 vezes.

### 5.2 Validação por diagnóstico interno

Use o módulo de diagnóstico (“Saúde → isolamento multi-tenant”) para checar se os IDs retornados pertencem à empresa ativa.

RISCO:
- Se o diagnóstico apontar “empresa ativa esperada X mas recebeu Y”, trate como P0.

### 5.3 Validação via SQL (sem dados sensíveis)

Em uma sessão autenticada (ou via verify), rode:
```sql
select current_setting('app.current_empresa_id', true) as guc_empresa;
select public.current_empresa_id() as current_empresa;
```

Resultado esperado:
- `guc_empresa` muda por requisição/aba, nunca “gruda” fora da transação.

## 6) Anti-regressão (regras para o frontend)

1) Toda chamada ao backend deve carregar o header `x-empresa-id` quando há empresa ativa.
2) Ao trocar de empresa ativa, invalidar caches (ex.: react-query) do tenant anterior.
3) Evitar “fetch no mount” antes de `activeEmpresaId` estar disponível.

RISCO:
- Cache no cliente pode “parecer vazamento”, mas se Network retorna dados errados, é vazamento real.

## 7) Checklist de mudanças que mexem em tenant resolution

Antes de merge:
- [ ] Rodou `yarn release:check`
- [ ] Rodou gates de migrations (`yarn verify:migrations`)
- [ ] Validou `pgrst.db_pre_request` configurado (SQL acima)
- [ ] Fez teste de duas abas
- [ ] Registrou evidência (issue/PR) com:
  - migration(s) tocadas,
  - query SQL de validação,
  - resultado do diagnóstico interno

