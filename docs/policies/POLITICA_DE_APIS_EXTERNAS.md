# CONTEXTO — POLÍTICA DE APIS EXTERNAS (Segurança em primeiro lugar)

**Objetivo:** autorizar somente APIs/SDKs/libs com boa reputação pública e sinais fortes de manutenção/segurança. Preferir Open Source e gratuitas.

## RULE — Gatilho de Segurança para APIs Externas

Sempre que a tarefa envolver **integrar/instalar API/SDK/lib externa (nova dependência)**, é **OBRIGATÓRIO** carregar e seguir este contexto: **`POLITICA_DE_APIS_EXTERNAS`**.

- Se **não** envolver API externa / nova dependência: **não** carregar este contexto.

## Preferência (ordem)

1) **Open Source + gratuita** (licença clara)
2) **Open Source paga** (se necessário e justificado) — me avisar antes dos custos
3) **Fechada/proprietária** (somente com exceções aprovadas)

## Gate mínimo (todos obrigatórios)

- Repo/pacote verificável (GitHub/GitLab) **ou** métricas equivalentes confiáveis.
- Manutenção ativa (atividade nos últimos **6–12 meses**).
- Reputação sólida (métricas públicas + sinais de não abandono).
- Segurança: sem alertas críticos conhecidos sem correção; security policy é diferencial.
- Licença compatível (preferir **MIT / Apache-2.0 / BSD**).
- Documentação/changelog/versionamento claros.

## Checklist obrigatório (registrar no PR/issue antes de instalar)

- [ ] Link repo/pacote + **versão alvo**
- [ ] Motivo de uso + **alternativas consideradas**
- [ ] Sinais de qualidade (stars/forks/contributors/última release)
- [ ] Saúde do projeto (issues/tempo de resposta – amostragem)
- [ ] Segurança (advisories/CVEs/histórico)
- [ ] Licença/compliance
- [ ] Plano de rollback

## Implantação segura

- **Pin** de versão + lockfile (proibido “latest” solto)
- Menor superfície de ataque (importar só o necessário)
- Auditoria no CI (ex.: `npm audit` / `pip-audit` / equivalente)
- Segredos em env/secret manager
- Observabilidade mínima
- Review obrigatório com foco segurança/infra

## Exceções

Somente se não houver alternativa viável, com risco documentado, aprovação explícita e mitigação/fallback.

Se não passa no gate, **NÃO entra**.

