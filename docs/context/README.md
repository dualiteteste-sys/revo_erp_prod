# docs/context/ — Memória Semântica do Projeto

Este diretório contém arquivos de **contexto por domínio** — estado atual, padrões, decisões e armadilhas de cada área do sistema.

## Por que existe

A janela de contexto de uma sessão de IA não é memória permanente.
Ao invés de depender do transcript de sessões anteriores (memória episódica, lossy),
estes arquivos capturam o **conhecimento estruturado atual** de cada domínio.

**Protocolo de uso:**
1. Ao iniciar trabalho em um domínio, leia o arquivo correspondente (30 segundos).
2. Ao concluir uma tarefa significativa, atualize o arquivo do domínio (10-20 linhas).
3. O arquivo deve refletir o **estado atual**, não o histórico.

## Índice

| Arquivo | Domínio | Quando ler |
|---|---|---|
| [code-patterns.md](code-patterns.md) | Padrões de código do projeto | Sempre que escrever código novo |
| [resilience-patterns.md](resilience-patterns.md) | Idempotência, double-submit, retry | Ops críticas, financeiro, estoque |
| [nfe-input-flow.md](nfe-input-flow.md) | Fluxo de entrada de NF-e XML | Qualquer toque em NfeInputPage ou RPCs de suprimentos |
| [ci-pipeline.md](ci-pipeline.md) | Pipelines CI/CD, gates, tempos | Mexer em workflows, CI, deploy |
| [integrations-testing.md](integrations-testing.md) | Testar integrações externas em dev | Stripe, NF-e, WooCommerce, marketplaces |

## Protocolo de atualização (handoff)

Ao concluir qualquer tarefa que toque um desses domínios, adicione no final do arquivo relevante:

```markdown
## Última atualização — YYYY-MM-DD

- O que mudou: <descrição em 1-2 linhas>
- PRs: #NNN
- Armadilhas encontradas: <se houver>
- Estado atual: <resumo do que é verdade agora>
```

Mantenha o arquivo em ≤150 linhas. Se crescer além disso, condense a seção "Última atualização" anterior.
