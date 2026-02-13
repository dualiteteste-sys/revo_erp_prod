# Módulo “Erros no Sistema” — operação em estado da arte

## Objetivo

Transformar erros em **incidentes acionáveis** para acelerar correção, sem depender de IA embutida no ERP.

## Pipeline implementado

1. **Coleta em tempo real**
   - `window.error`
   - `unhandledrejection`
   - `console.error` e `console.warn`
   - falhas de RPC/Edge (`network.rpc` / `network.edge`)
2. **Normalização**
   - mensagem, stack, rota, `request_id`, `http_status`, `code`, URL sanitizada.
3. **Classificação**
   - severidade: `P0`, `P1`, `P2`
   - tipo: `frontend`, `network`, `auth`, `tenant`, `external`, `unknown`
4. **Deduplicação**
   - fingerprint por rota + status/código + URL + mensagem.
5. **Ruído externo**
   - mensagens típicas de extensão do navegador são classificadas como externas e não entram em incidentes acionáveis.
6. **Prompt técnico**
   - botão “Copiar prompt” gera template padrão com resumo, evidências, reprodução, hipóteses e critério de pronto.

## Como usar na prática

1. Abra `Desenvolvedor → Erros no Sistema`.
2. Veja a tabela **Incidentes em tempo real (agregados)**.
3. Priorize `P0`, depois `P1`.
4. Clique em **Copiar prompt** no incidente.
5. Envie o prompt para o agente responsável.

## Campos críticos para diagnóstico

- `request_id`
- `http_status` e `code`
- rota (`route`)
- fonte (`source`)
- `first_seen_at`, `last_seen_at`, `occurrences`

## Observações de segurança

- Sem segredos em prompt/log (`token`, `Authorization`, `consumer_secret` etc.).
- URLs e payloads passam por sanitização.
- Não usar fallback silencioso para ocultar erro crítico.
