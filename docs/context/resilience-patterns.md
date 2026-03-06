# Padrões de Resiliência — Revo ERP

Estado atual dos padrões de confiabilidade. Leia ao tocar em operações críticas de financeiro, estoque, fiscal ou vendas.

---

## 1) Anti double-submit (frontend)

**Regra:** toda ação que gera efeito no backend deve ser protegida em duas camadas.

### Camada 1 — botão travado durante execução

```tsx
const { mutate, isPending } = useMutation({ mutationFn: emitirNfe });

<Button
  onClick={() => mutate(payload)}
  disabled={isPending}
  loading={isPending}
>
  {isPending ? 'Emitindo...' : 'Emitir NF-e'}
</Button>
```

### Camada 2 — idempotência no backend (RPC)

A RPC deve usar uma chave de deduplicação. Se a mesma operação chegar duas vezes, a segunda deve ser idempotente (retornar o mesmo resultado sem duplicar efeitos).

```sql
-- Padrão de idempotência no banco
INSERT INTO pedidos (id, empresa_id, origem_ref, ...)
VALUES (gen_random_uuid(), current_empresa_id(), p_origem_ref, ...)
ON CONFLICT (empresa_id, origem_ref) DO UPDATE SET updated_at = now()
RETURNING id;
```

**Campos de deduplicação por domínio:**
| Domínio | Chave de deduplicação |
|---|---|
| PDV | `pdv_session_id + caixa_id` |
| NF-e emissão | `pedido_id + serie + numero_tentativa` |
| NF-e webhook | `focus_id + event_type` |
| Recebimento XML | `chave_acesso` |
| Marketplace job | `provider + external_id + job_kind` |
| Cobrança Stripe | `stripe_event_id` |
| Baixa financeira | `lancamento_id + conta_id + data_competencia` |

---

## 2) Idempotência em operações críticas

**Quando é obrigatório:** qualquer operação que movimenta dinheiro, estoque ou emite documento fiscal.

**Como implementar:**

```sql
-- Função idempotente com trilha de auditoria
CREATE OR REPLACE FUNCTION financeiro_baixar_lancamento(
  p_lancamento_id uuid,
  p_conta_id uuid,
  p_data_competencia date,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  -- 1) Verificar se já foi processado
  SELECT id INTO v_existing_id
  FROM financeiro_movimentacoes
  WHERE empresa_id = current_empresa_id()
    AND origem_ref = p_idempotency_key
    AND p_idempotency_key IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing_id, 'status', 'already_processed');
  END IF;

  -- 2) Processar normalmente
  -- ...
END;
$$;
```

**Regra crítica:** toda RPC que cria ou modifica dados financeiros deve verificar duplicidade ANTES de executar.

---

## 3) Retry e backoff

**Frontend — pattern com abort:**

```typescript
// src/lib/api.ts já implementa retry automático para erros transitórios
// Use callRpc() sempre — não reimplemente retry manualmente

// Para mutations que precisam de retry manual:
const { mutate, isError, reset } = useMutation({
  mutationFn: emitirNfe,
  retry: 0, // Não auto-retry em mutations com efeito colateral
});

// UI: botão "Tentar novamente" que chama reset() + mutate()
```

**Regra:** mutations (POST/PUT/DELETE) NÃO devem ter auto-retry — deixar para o usuário decidir. Queries (GET) podem ter retry automático (React Query default é 3x).

**Workers/filas — backoff exponencial:**

```sql
-- Padrão de retry com backoff nas tabelas de job
UPDATE ecommerce_jobs
SET
  status = 'pending',
  scheduled_at = now() + (INTERVAL '1 minute' * POWER(2, retry_count)),
  retry_count = retry_count + 1,
  last_error = p_error_message
WHERE id = p_job_id
  AND retry_count < 5  -- máximo 5 tentativas (~31 min total)
  AND empresa_id = current_empresa_id();
```

---

## 4) Timeout handling

**Frontend — AbortController:**

```typescript
// Para RPCs que podem demorar (emissão NF, processamento batch)
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s

try {
  const result = await callRpc('minha_rpc_lenta', payload, { signal: controller.signal });
  clearTimeout(timeoutId);
  return result;
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') {
    throw new Error('A operação excedeu o tempo limite. Tente novamente.');
  }
  throw err;
}
```

**Timeouts por camada:**
| Camada | Timeout | Configuração |
|---|---|---|
| Frontend RPC padrão | 30s | callRpc default |
| Edge Function | 60s | Supabase limit |
| Worker assíncrono | 5min | cron job |
| Retry máximo | 31min | 5 tentativas com backoff |

---

## 5) Operações "meio gravadas" — como evitar

**Sintoma:** usuário clica, operação falha no meio, estado fica inconsistente.

**Prevenção — transações atômicas no banco:**

```sql
-- SEMPRE envolver operações multi-tabela em transação (Supabase RPC já garante isso por padrão)
-- Nunca fazer múltiplas chamadas RPC para operações que precisam ser atômicas

-- ERRADO (frontend): 2 RPCs separadas que podem falhar entre si
await callRpc('criar_pedido', payload);
await callRpc('dar_baixa_estoque', { pedido_id }); // Se isso falhar, pedido fica sem baixa

-- CORRETO: 1 RPC que faz tudo atomicamente
await callRpc('finalizar_pedido_com_estoque', payload);
```

**Regra:** se duas ou mais operações devem ser atômicas, elas devem ser uma única RPC com transação.

---

## 6) Circuit breaker e degradação elegante

**Quando uma integração cai (WooCommerce, Focus NF-e, Stripe):**
- Jobs vão para fila com status `pending` → não bloqueiam o sistema
- DLQ após N tentativas → aparece em Dev → Saúde → botão de reprocesso
- UI mostra "Integração indisponível" com CTA "Ver status" → nunca trava o usuário

**Implementação no frontend:**

```tsx
// Falha de integração NÃO deve bloquear operações principais
// Exemplo: WooCommerce offline não deve impedir emissão de pedidos
const { data: wooStatus } = useQuery({
  queryKey: ['woo-health'],
  queryFn: getWooHealthStatus,
  retry: false,         // Não insistir se estiver offline
  staleTime: 60_000,   // Cache de 1 min para não fazer poll constante
});

// Mostrar badge de status, nunca bloquear ação principal
```

---

## 7) Padrão de lock por entidade (evitar concorrência)

**Para operações que não podem ser executadas em paralelo (fechar caixa, emitir NF-e):**

```sql
-- Row-level lock com NOWAIT (falha imediatamente se já está em uso)
SELECT id FROM pedidos
WHERE id = p_pedido_id AND empresa_id = current_empresa_id()
FOR UPDATE NOWAIT;
-- Se outro processo já tem o lock, lança exceção → frontend mostra "Em andamento"
```

---

## Última atualização — 2026-03-06

- Documento criado consolidando padrões de resiliência estabelecidos em múltiplas sessões.
- PRs: planejamento de documentação (FASE 1).
- Estado atual: padrões validados em PDV, NF-e, marketplace jobs e financeiro.
- Armadilha conhecida: FK ON DELETE CASCADE em `recebimento_itens.fiscal_nfe_item_id` → re-importar XML deleta itens e quebra recebimento. Fix em PR #887.
