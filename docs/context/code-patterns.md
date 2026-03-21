# Padrões de Código — Revo ERP

Estado atual dos padrões estabelecidos. Leia ao iniciar qualquer sessão de código novo.

---

## 1) Camadas e responsabilidades

```
src/
  pages/          → componentes de página (orquestração, layout, state de UI)
  components/     → componentes reutilizáveis (sem state de domínio)
  hooks/          → lógica de dados e side effects (React Query, auth, features)
  services/       → chamadas RPC puras (sem state, sem React)
  lib/            → utilitários agnósticos (api.ts, sanitize, telemetry, etc.)
  contracts/      → tipos de DTOs compartilhados entre services e hooks
  contexts/       → providers React (ToastProvider, AuthProvider, etc.)
```

**Regras:**
- `pages/` orquestram mas não chamam `callRpc()` diretamente → usam services ou hooks.
- `services/` são funções puras: recebem parâmetros, retornam Promise, sem React.
- `hooks/` encapsulam React Query (`useQuery`/`useMutation`) + invalidação de cache.
- Nenhum `supabase.from()` fora do allowlist (`scripts/supabase_from_allowlist.json`).

---

## 2) RPC pattern

```typescript
// services/meuDominio.ts
import { callRpc } from '@/lib/api';

export type MinhaEntidade = { id: string; nome: string; empresa_id: string };

export async function listarMinhasEntidades(filtro: string): Promise<MinhaEntidade[]> {
  return callRpc<MinhaEntidade[]>('meu_dominio_list', { p_filtro: filtro });
}
```

- **Sempre tipar o retorno** — `callRpc<T>()`, nunca `callRpc<any>()`.
- Nomes de parâmetros seguem a convenção do banco: `p_<nome>`.
- Tipos de DTO vão em `src/contracts/` quando compartilhados entre múltiplos services.

---

## 3) Convenções TypeScript

| Regra | Correto | Errado |
|---|---|---|
| Tipo desconhecido | `unknown` | `any` |
| Tipo de retorno de RPC | `callRpc<MinhaEntidade[]>` | `callRpc<any>` |
| Props de componente | `interface MinhaProps { ... }` | props inline sem tipo |
| Discriminated union | `type Status = 'ativo' \| 'inativo'` | `string` genérico |
| Validação em runtime | Zod schema na boundary | cast direto com `as` |

**Exceções permitidas para `any`:** zero. Usar `unknown` + type guard ou Zod.

---

## 4) Tamanho de arquivos e funções

- Arquivo de página: **≤400 linhas**. Se exceder, extrair subcomponentes ou hooks.
- Arquivo de componente reutilizável: **≤200 linhas**.
- Função: **≤40 linhas**. Funções longas indicam que fazem mais de uma coisa.
- Hook: **≤80 linhas**. Se maior, provavelmente mistura responsabilidades.

Quando um arquivo de página crescer além de 400 linhas:
1. Extrair subtabelas como `MeuModuloTable.tsx`
2. Extrair formulários como `MeuModuloForm.tsx`
3. Extrair a lógica de negócio em `useMeuModulo.ts`

---

## 5) Nomes — convenções

| Tipo | Padrão | Exemplo |
|---|---|---|
| RPC (banco) | `dominio_verbo_complemento` | `estoque_item_list`, `fiscal_nfe_emit` |
| Service function | `verboDominio()` | `listarProdutos()`, `emitirNfe()` |
| Hook | `use + Substantivo` | `useEstoque`, `useActiveEmpresaId` |
| Componente | `PascalCase` | `ProdutoTable`, `NfeInputPage` |
| Estado booleano | `is/has/can + Verbo` | `isLoading`, `hasError`, `canEdit` |
| Handler de evento | `handle + Evento` | `handleSubmit`, `handleRowClick` |

---

## 6) Padrões React Query

```typescript
// Hook padrão (leitura)
export function useProdutos(filtro: string) {
  const empresaId = useActiveEmpresaId();
  return useQuery({
    queryKey: ['produtos', empresaId, filtro],  // empresaId SEMPRE na key
    queryFn: () => listarProdutos(filtro),
    staleTime: 5 * 60 * 1000,                  // 5 min para listas estáticas
    enabled: !!empresaId,                        // nunca buscar sem tenant
  });
}

// Mutation padrão
export function useCriarProduto() {
  const qc = useQueryClient();
  const empresaId = useActiveEmpresaId();
  return useMutation({
    mutationFn: criarProduto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos', empresaId] });
    },
  });
}
```

**Regras críticas:**
- `queryKey` SEMPRE inclui `empresaId` — previne cross-tenant cache.
- `enabled: !!empresaId` — nunca buscar sem tenant resolvido.
- `staleTime` mínimo de 30s em listas (evita waterfall de requests).
- Invalidar apenas as queries afetadas (não `qc.invalidateQueries()` sem key).

---

## 7) Tratamento de erros

```typescript
// Padrão de erro em mutation
onError: (err) => {
  const msg = err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.';
  addToast(msg, 'error');
  // Nunca usar alert() — sempre toast ou mensagem inline
}
```

- **Nunca** usar `alert()`, `confirm()`, `console.error()` em produção.
- Erros de RPC já têm mensagem do banco — usar `err.message` diretamente.
- Erros 403 são tratados automaticamente pelo `callRpc` (recovery de tenant).
- Erros de validação: mensagem inline no campo, não toast.

---

## 8) Componentes de formulário

```typescript
// Padrão de formulário com React Hook Form + Zod
const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  valor: z.number().positive('Valor deve ser positivo'),
});

type FormData = z.infer<typeof schema>;

function MeuForm({ onSuccess }: { onSuccess: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  // ...
}
```

- Campos monetários: usar `useNumericField` (docs/frontend/inputs-monetarios.md).
- Botão de submit: desabilitar durante `isSubmitting` (anti-double-submit visual).
- Validação server-side: capturar no `onError` da mutation e exibir como campo error.

---

## 9) Princípios gerais (SOLID/DRY/KISS aplicados)

- **Single Responsibility**: cada arquivo/função faz uma coisa. Se o nome precisa de "e" ou "ou", divida.
- **DRY**: se copiar mais de 3 linhas de lógica, extraia para função/hook compartilhado.
- **KISS**: solução mais simples que funciona corretamente. Não antecipe requisitos futuros.
- **Não adicionar**: comentários óbvios, docstrings em código auto-explicativo, `console.log` em produção.
- **Adicionar**: comentários onde a lógica NÃO é auto-evidente (edge cases, workarounds, regras de negócio não óbvias).

---

## Última atualização — 2026-03-06

- Documento criado como parte da infraestrutura de memória semântica do projeto.
- PRs: planejamento de documentação (FASE 1).
- Estado atual: padrões estabelecidos e validados em múltiplas sessões de desenvolvimento.

## Última atualização — 2026-03-21

- O que mudou: foi introduzida a camada inicial `assistant` para a Isa, com `Provider`, componentes em `src/components/assistant/` e núcleo em `src/lib/assistant/`.
- O que mudou: a integração global entra pelo `MainLayout`, mas a lógica de contexto/capacidades fica fora de `pages/`, preservando a separação entre UI, contexto e engine.
- PRs: n/a (trabalho local ainda não submetido).
- Armadilhas encontradas: o avatar precisa ter fallback local, então a UI não deve depender da existência imediata dos arquivos em `public/assistant/`.
- Estado atual: a Isa opera por regras/contexto, sem LLM obrigatório; qualquer provedor futuro deve entrar via adapter (`assistantModelAdapter`) sem acoplar o fornecedor à UI.
