## Release Gate (RG-01)

- [ ] Rode localmente `yarn release:check` (ou confirme que o CI passou)
- [ ] CI no `dev` com ✅ em:
  - `Release Gate (dev)`
  - `Verify Migrations (dev)`
  - `E2E Release Gate (dev)`
- [ ] Se este PR “encostou” no Supabase (qualquer coisa): existe migration em `supabase/migrations/*` e ela foi verificada no CI
- [ ] Se este PR adiciona dependência/API externa: checklist e gate em `docs/policies/POLITICA_DE_APIS_EXTERNAS.md`
- [ ] (Múltiplos agentes) Branch/PR segue `docs/policies/POLITICA_COLABORACAO_AGENTES.md` (branch própria → PR para `dev`; `main` só via PR `dev→main`)
- [ ] (Opcional) Labels de risco aplicados quando necessário (`risk:high`/`risk:low`) — ver `docs/ci/risk-based-gates.md`

## Guias rápidos / Roadmap (RG-02)

- [ ] Se este PR alterou fluxo/UX: atualizei o guia rápido em `src/components/support/helpCatalog.ts`
- [ ] Se este PR mudou pré‑requisitos/onboarding: atualizei o Roadmap em `src/components/roadmap/roadmaps.ts`
- [ ] Adicionei/atualizei teste E2E/Smoke para o fluxo alterado e mantive “console limpo”

## Testes “anti‑surpresa” (RG-03)

- [ ] Mudança crítica (auth/onboarding/financeiro/estoque/vendas): tem E2E/Smoke cobrindo happy path (e falha comum quando aplicável)
- [ ] Mudança em service/RPC/shape de retorno: tem teste unitário de contrato/normalização

## O que foi mudado?

Descreva em 3–6 bullets o que mudou e como validar.
