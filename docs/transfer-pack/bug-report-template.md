# Bug Report Template (baixo custo, alto sinal)

Use este template para enviar bugs de forma que um agente (ou dev humano) resolva rápido, sem “explodir tokens”.

## 1) Contexto

- Ambiente: `LOCAL` | `DEV` | `PROD`
- URL/rota: `/app/...`
- Ação do usuário (último clique): `...`
- Empresa ativa: `empresa_id=...` (se aplicável)
- Usuário: `email=...` (sem senha)
- Data/hora (UTC-3): `YYYY-MM-DD HH:mm`

## 2) Console (somente erros vermelhos)

Cole **apenas** a(s) linha(s) com erro(s) e, se existir, a stack curta.

## 3) Network (1 request principal)

- Request: `POST/GET <url>` (RPC/Function)
- Status: `xxx`
- `request_id`: `...` (se existir)
- Response JSON (1 bloco):
```json
{ "code": "...", "message": "..." }
```

## 4) Esperado vs Atual

- Esperado: `...`
- Atual: `...`

## 5) Reproduzibilidade

- [ ] Sempre
- [ ] Intermitente
- [ ] Somente após trocar empresa (multi-tenant)
- [ ] Somente após reload

## 6) Evidência

- Screenshot/gravação (1 arquivo) ou passos numerados.

## 7) Segurança / Multi-tenant (se aplicável)

- [ ] Suspeita de vazamento tenant (dados de outra empresa)
- [ ] Suspeita de cache (UI mostra, mas Network não)
- [ ] Confirmado: Network retornou `empresa_id` diferente da empresa ativa

