# NF-e Input Flow — Contexto do Domínio

Estado atual do fluxo de entrada de NF-e (recebimento de XML de fornecedores).
Leia antes de tocar em `NfeInputPage`, `nfeInput.ts`, `recebimento.ts` ou RPCs de suprimentos.

---

## 1) Visão geral do fluxo (5 etapas)

```
Upload XML / DANFE
       ↓
  Revisão (dados da NF)
       ↓
  Vínculos (match de itens → produtos internos)
       ↓
  Conferência (qtd conferida + lote por item)
       ↓
  Sucesso (estoque atualizado)
```

**Componente principal:** `src/pages/tools/NfeInputPage.tsx`
**Services:** `src/services/nfeInput.ts`, `src/services/recebimento.ts`

---

## 2) RPCs envolvidas

| RPC | Quando chamada | O que faz |
|---|---|---|
| `fiscal_nfe_import_register` | Upload → Revisão | Registra/atualiza o import pela chave de acesso (ON CONFLICT DO UPDATE). Deleta e recria `fiscal_nfe_import_items`. |
| `beneficiamento_preview` | Revisão → Vínculos | Retorna itens com match automático (SKU ou EAN). Inclui `n_lote` do XML e `match_strategy`. |
| `_create_recebimento_from_xml` | Vínculos → Conferência | Cria ou reabre o recebimento. Retorna `'created'` ou `'reopened'`. Detecta cascade-delete e recria itens. |
| `beneficiamento_process_from_import` | Finalizar | Processa o import, gera movimentações de estoque. |
| `suprimentos_recebimento_item_set_lote` | Finalizar (após conferência) | Atualiza lote por item do recebimento. |
| `estoque_process_from_recebimento` | Chamada pelo process | Lê `lote`/`data_validade` por item (não mais hardcoded `'SEM_LOTE'`). |

---

## 3) Tipos TypeScript relevantes

```typescript
// src/services/nfeInput.ts
export type NfeImportItem = {
  item_id: string;
  n_item: number;
  cprod: string | null;
  ean: string | null;
  xprod: string | null;
  ucom: string | null;
  qcom: number;
  vuncom: number;
  vprod: number;
  n_lote?: string | null;              // lote do XML (pré-populado na conferência)
  match_produto_id: string | null;
  match_strategy: 'sku' | 'ean' | 'none';  // ATENÇÃO: era 'codigo' antes do PR #887
};

// src/services/recebimento.ts
export async function updateRecebimentoItemLote(
  itemId: string,
  lote: string | null
): Promise<void>
```

---

## 4) Estado React na página

```typescript
// Principais estados em NfeInputPage
const [step, setStep]                           // 'upload' | 'review' | 'vinculos' | 'conferencia' | 'success'
const [importId, setImportId]                   // ID do fiscal_nfe_import
const [previewData, setPreviewData]             // PreviewResult com itens e match
const [manualMatches, setManualMatches]         // Record<item_id, { id, name, codigo? }>
const [lotesManual, setLotesManual]             // Record<item_id, string> — lote por item
const [confSort, setConfSort]                   // SortState<'item' | 'qtyXml' | 'qtyConf' | 'lote' | 'status'>
const [recebimentoId, setRecebimentoId]        // ID do recebimento criado/reaberto
```

---

## 5) Bugs conhecidos e seus fixes (histórico)

### Bug 1 + 2 — Badge "None" e Cód/EAN não apareciam (PR #887)
- **Causa:** `match_strategy` estava tipado como `'codigo'` mas banco retorna `'sku'`. Badge era exibido para `strategy !== 'none'` sem checar `'none'` explicitamente.
- **Fix:** tipo corrigido para `'sku' | 'ean' | 'none'`. Badge renderizado condicionalmente.

### Bug 3 + 4 — Cascade delete ao re-importar XML (PR #887)
- **Causa:** `fiscal_nfe_import_register` faz `DELETE + INSERT` nos items. FK `recebimento_itens.fiscal_nfe_item_id` tem `ON DELETE CASCADE`. Items do recebimento sumiam silenciosamente. `_create_recebimento_from_xml` retornava `'exists'` sem recriar.
- **Fix (migration):** `_create_recebimento_from_xml` detecta cascade-delete e recria os itens. Retorna `'reopened'` nesse caso.

### Bug 5 — Lote sempre "SEM_LOTE" mesmo com XML tendo lote (PR #887)
- **Causa:** `estoque_process_from_recebimento` hardcodava `'SEM_LOTE'`.
- **Fix (migration):** RPC lê `lote`/`data_validade` por item. UI adicionou coluna de lote editável na Conferência, inicializada com `n_lote` do XML.

---

## 6) Armadilhas e edge cases

1. **Re-import do mesmo XML:** `fiscal_nfe_import_register` é idempotente pela `chave_acesso`. Pode ser chamado múltiplas vezes com segurança, mas recria os items — risco de cascade (veja Bug 3+4 acima).

2. **Vínculos manuais vs automáticos:** `manualMatches` tem prioridade sobre `match_produto_id` no passo de conferência. Ao ir para Conferência, `handleGoToConferencia` combina os dois.

3. **Lote do XML vs lote manual:** `lotesManual` é inicializado com `n_lote` do XML em `handleGoToConferencia`. Usuário pode sobrescrever na coluna de Conferência. O valor final enviado é sempre de `lotesManual`.

4. **`_create_recebimento_from_xml` pode retornar `'exists'`:** nesse caso o recebimento já estava ok (não houve cascade). É normal para re-abertura sem re-import.

---

## 7) Migration canônica deste domínio

`supabase/migrations/20270305100000_sup_fix_nfe_input_flow.sql`

Contém os fixes 3, 4 e 5 listados acima.

---

## Última atualização — 2026-03-06

- 5 bugs corrigidos em PR #887 (merged dev e main).
- Estado atual: fluxo completo funcional. Lote, vínculos e conferência operando corretamente.
- Pendente: testes E2E específicos do fluxo de 5 etapas (não cobertor por E2E atual).
