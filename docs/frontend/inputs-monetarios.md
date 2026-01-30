# Context Pack — Inputs monetários (padrão REVO “sem vírgula”)

Este documento define o **padrão obrigatório** para campos de valores no REVO (moeda, preço unitário, frete, desconto, etc.).

Objetivo: **digitação fácil** → o usuário digita apenas números e o sistema formata automaticamente (`pt-BR`, 2 casas).

## Quando ativar este Context Pack (gatilho)

Ative (leia este doc) sempre que você:
- criar/alterar **qualquer campo de dinheiro/preço/valor** em formulários ou tabelas;
- criar/alterar **edição inline** de valores (ex.: grids/listagens);
- mexer em **importação** que parseia valor monetário (CSV/XLSX/OFX);
- notar bug de digitação “travada”, “pulando cursor” ou exigindo digitar vírgula.

## Regra de ouro (Estado da Arte)

1) **Nunca exigir vírgula do usuário.**  
   Ex.: usuário digita `400` → input mostra `4,00` (R$ 4,00).
2) **Nunca usar `type="number"`** para dinheiro.  
   Use `type="text"` + `inputMode="numeric"`.
3) **Fonte de verdade do dado é number (em reais)** no state, mas o input controla string formatada.
4) Não reinventar máscara: use as primitivas do projeto.

## Implementação padrão (obrigatória)

Use o hook:
- `src/hooks/useNumericField.ts`

Exemplo (recomendado):

```tsx
const valorProps = useNumericField(formData.valor_total, (v) => setFormData((p) => ({ ...p, valor_total: v })));

<input
  type="text"
  inputMode="numeric"
  value={valorProps.value}
  onChange={valorProps.onChange}
/>
```

### Padrão com prefixo “R$”

- O prefixo deve ser **visual**, não parte do valor digitado.
- Use um `span` absoluto à esquerda e `padding-left` no input (ex.: `pl-8`).

## Anti-padrões (proibido)

- Criar lógica ad-hoc de `replace(/\D/g,'')` diretamente no componente (tende a regressão e bugs de cursor).
- Misturar `Intl.NumberFormat` com `onChange` sem um buffer/hook (gera travamento e “cursor pulando”).
- Usar `step`, `min`, `max` com `type="number"` para dinheiro (inconsistência por locale).

## Checklist rápido antes de merge

- [ ] Digitar `1` → aparece `0,01`
- [ ] Digitar `10` → aparece `0,10`
- [ ] Digitar `100` → aparece `1,00`
- [ ] Selecionar todo o texto e apagar → valor vira vazio e state vira `null` (ou `0`, conforme regra do form)
- [ ] Colar `R$ 1.234,56` → normaliza e mantém `1.234,56`

## Onde esse padrão já é usado (referências)

- `src/components/suprimentos/compras/CompraFormPanel.tsx` (`CurrencyCellInput`)
- `src/components/financeiro/contas-pagar/ContasPagarFormPanel.tsx` (campos de valores)
- `src/components/products/form-tabs/PrecosTab.tsx` (faixas de preço)

