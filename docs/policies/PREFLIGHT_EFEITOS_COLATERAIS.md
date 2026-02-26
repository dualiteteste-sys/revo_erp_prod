# POLÍTICA — PREFLIGHT DE EFEITOS COLATERAIS (ANTI-RETRABALHO)

Objetivo: reduzir retrabalho, ciclos de CI e regressões, forçando análise de risco antes de qualquer mudança.

## 1) Regra obrigatória

- Antes de implementar qualquer tarefa, preencher o Preflight.
- Sem Preflight preenchido, a implementação não deve começar.
- O Preflight deve ser incluído no PR e nas mensagens de handoff.

## 2) Escopo mínimo do Preflight

Preencher sempre estes blocos:

1. Risco funcional
- O que pode quebrar no fluxo do usuário.

2. Risco de dados/contrato
- Mudança de DTO, RPC, migration, shape de retorno ou semântica de campos.

3. Risco de UI/UX
- Campos com fallback enganoso, estados incoerentes, ações não intuitivas.

4. Risco de cálculo
- Totais, ordenação, diferenças, consolidação, arredondamento.

5. Risco operacional
- Deploy, rollback, necessidade de feature flag, impacto em ambiente dev/main.

## 3) Matriz obrigatória

Para cada risco identificado, documentar:

- Risco:
- Severidade: Alta | Média | Baixa
- Mitigação no código:
- Teste obrigatório:
- Evidência de validação:

## 4) Regras de implementação

- Nunca mascarar erro crítico com fallback silencioso.
- Não usar `0` como fallback para valor desconhecido em financeiro.
- Se dado essencial estiver ausente, sinalizar claramente e bloquear ação insegura.
- A origem de valor exibida na UI deve ser compatível com a origem usada no cálculo/validação.
- Mudou fluxo/UI? **Atualizar o Guia rápido do módulo** em `src/components/support/helpCatalog.ts` (evita módulo “meia-boca” e suporte caro).
- Em erro de UI: **toast palatável + ação** (para usuário) e detalhes técnicos somente em log/captura (ex.: `request_id`, `code`, `rpc_fn`).

## 5) Gate antes do merge

O PR só está apto quando:

- Matriz de riscos preenchida.
- Mitigações implementadas.
- Testes obrigatórios executados.
- CI verde.

## 6) Template curto para usar no PR

```md
### Preflight de efeitos colaterais

| Risco | Severidade | Mitigação no código | Teste obrigatório | Evidência |
|---|---|---|---|---|
| Ex.: fallback monetário incorreto | Alta | bloquear ação e exibir "valor ausente" | unit + fluxo de conciliação | teste X + QA Y |
```
