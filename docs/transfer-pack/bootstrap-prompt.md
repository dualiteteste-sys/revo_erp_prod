# BOOTSTRAP PROMPT (plug-and-play)

Copie/cole este prompt quando abrir uma nova janela de contexto:

---

Você está no repo do **Revo ERP**.

1) Leia `AGENTS.md` e siga as invariantes e Definition of Done.
2) Identifique o escopo do trabalho (frontend, migrations, RLS, billing, etc.).
3) Se tocar em Supabase/RLS/RPC, leia também:
   - `docs/supabase-from-policy.md`
   - `docs/multi-tenant/tenant-resolution.md`
   - `docs/supabase-prod-alignment.md`
   - `docs/deploy.md`
4) Não inclua segredos no código. Use apenas nomes e placeholders.
5) Fluxo com múltiplos agentes:
   - trabalhe em uma branch própria (`ai/<agent-id>/<tipo>-<slug>`),
   - abra PR para `dev`,
   - `main` só via PR `dev→main`.
   - Leia `docs/policies/POLITICA_COLABORACAO_AGENTES.md` quando o trabalho envolver branches/PR/CI.
6) Antes de concluir:
   - rode `yarn release:check` (ou garanta CI verde),
   - garanta console/network limpos no fluxo alterado,
   - execute validação anti-tenant-leak (duas abas) se o domínio for multi-tenant.

Se algo não puder ser validado agora, marque como **RISCO** e escreva como validar.

---
