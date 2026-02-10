# Postmortem — Loop infinito de RPC em Configurações > Marketplace

Data: 2026-02-10  
Status: corrigido em branch `codex/ai/bugs-especialist-cypher/fix-marketplace-rpc-loop`

## Resumo

Ao abrir `Configurações > Marketplace`, a UI podia entrar em loop de chamadas para:

- `ecommerce_connection_diagnostics`
- `ecommerce_import_jobs_list`

O loop aumentava progressivamente o volume de requests até `net::ERR_INSUFFICIENT_RESOURCES`.

## Causa raiz

No componente `MarketplaceIntegrationsPage`, o `useEffect` de carga inicial dependia de `fetchAll`, que dependia de `loadAllProviderJobs`, que dependia de `loadProviderJobs`.

`loadProviderJobs` era recriado a cada atualização de estado porque dependia de objetos mutáveis em state (`jobsOffsetByProvider` e `jobsStatusFilterByProvider`), alterados dentro do próprio fluxo de carregamento.

Com isso:

1. `loadProviderJobs` mudava de identidade
2. `loadAllProviderJobs` mudava de identidade
3. `fetchAll` mudava de identidade
4. `useEffect(() => fetchAll(), [fetchAll])` disparava novamente
5. o ciclo reiniciava (loop)

## Por que apareceu como “só em produção”

A regressão é de código (não de infra), mas pode aparecer de forma muito mais severa em produção por:

- volume real de dados e latência mais alta,
- combinações de permissão/estado de conexão diferentes do ambiente de dev,
- maior sensibilidade do browser em sessão real (muitas abas/extensões/processos).

Ou seja, não é esperado confiar em “não reproduziu em dev” para esse tipo de efeito colateral.

## Correções aplicadas

1. **Estabilização de dependências**
   - Leitura de `offset`/`status` movida para `useRef`.
   - `loadProviderJobs` deixou de depender de objetos de estado que mudam por referência.

2. **Polling controlado de jobs**
   - Polling somente com jobs ativos (`pending/processing`).
   - Intervalo ativo/idle definido e pausa quando aba não está visível.
   - Backoff em caso de erro de polling.

3. **Guard rail anti-loop no client**
   - Adicionado `rpcBurstGuard` para bloquear bursts anormais por chave de RPC.
   - Exibe aviso e impede tempestade de requests.

4. **Teste automatizado**
   - `rpcBurstGuard.test.ts` cobre bloqueio por burst e recuperação após janela de bloqueio.

## O que evitar daqui para frente

1. Não colocar objetos mutáveis de state em dependências de callbacks usados por efeitos de bootstrap.
2. Não fazer polling sem critério de parada.
3. Não manter diagnóstico pesado em auto-refresh contínuo.
4. Toda feature com polling deve ter:
   - condição de início,
   - condição de parada,
   - backoff,
   - cleanup no unmount.
5. Em PR de UI com RPC, revisar explicitamente o grafo:
   - `effect -> callback -> setState -> callback identity -> effect`.

## Checklist preventivo para PRs similares

- [ ] `useEffect` de bootstrap depende apenas de sinais estáveis.
- [ ] Polling somente quando necessário (status/visibilidade).
- [ ] Retry e backoff limitados.
- [ ] Guard rail para burst por endpoint crítico.
- [ ] Teste cobrindo cenário de proteção (anti-loop).

