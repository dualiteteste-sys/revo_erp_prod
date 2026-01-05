# Manual de Testes (Go‑Live) — REVO ERP

Este manual serve para **testar tudo o que já foi implementado** antes de um release e, ao mesmo tempo, explicar:
- **o que o cliente ganha** em cada módulo (benefícios práticos)
- **o que a REVO ganha** (redução de suporte, menos retrabalho, menos risco)
- **por que é “Estado da Arte”** (ou o que falta para virar)

> Regra: um módulo “passa” quando o fluxo **funciona sem gambiarra**, **sem erro de console**, **com permissões corretas**, e **com dados consistentes** no banco.

## 0) Como usar este manual (o método)

### 0.1 O que você precisa antes de testar
- Ambiente: **PROD** (ou DEV quando for teste de feature em andamento).
- Acesso: usuário **Owner/Admin** + pelo menos um usuário **Member/Viewer** para validar RBAC.
- Base: uma empresa criada e ativa.

### 0.2 O que registrar durante o teste (padrão)
Para cada falha, registre:
- Módulo + tela + ação (ex.: `Suprimentos > Estoque > Transferência`)
- Resultado esperado vs atual
- Console (se houver) e request (RPC/REST)
- Se é **bloqueio** (P0) ou **melhoria** (P1/P2)

Sugestão prática: abrir uma issue com título:
`[P0][Suprimentos] Transferência duplica kardex ao reenviar`

### 0.3 Critérios de “aprovado”
- Sem `HTTP 4xx/5xx` inesperado no console.
- Sem exceções React / erros não tratados.
- RBAC/RLS: usuário sem permissão **não enxerga** e **não executa** via UI nem via console.
- Estados vazios e mensagens claras (sem `alert()`).
- Ações críticas idempotentes (repetir clique não duplica).
- GitHub Actions: PR/merge só com **checks verdes**.

### 0.4 Release Gate (o “teste final”)
Quando for fechar release:
- `yarn test --run`
- `yarn test:e2e:gate:all`
- `yarn verify:migrations` (precisa Docker)

> Se `verify:migrations` falhar no local por falta de Docker, o CI continua sendo a fonte de verdade.

---

## 1) Caminho de teste por “jornada” (mais eficiente que testar menu item por item)

### Jornada A — “Comecei hoje e já preciso operar”
Objetivo: garantir que um cliente novo consegue chegar ao **primeiro valor** rápido.
1) Login → criar empresa → onboarding (mínimo)
2) Cadastros básicos: cliente e produto
3) Compra/Recebimento → estoque atualizado
4) Pedido/PDV → financeiro gerado (quando aplicável)

**Vantagens para o cliente**
- “Em poucos minutos já estou vendendo e controlando caixa”.

**Vantagens para a REVO**
- Menos tickets de “não sei por onde começar”.
- Menos abandono no trial.

**Por que é Estado da Arte**
- Primeiro valor rápido + UX guiada + sem travar o uso.

---

## 2) Testes por módulo (com caminho, checklist e benefícios)

> Formato padrão por módulo:
> - Caminho
> - Happy path (o que deve funcionar)
> - Testes de segurança/permissão (o que deve bloquear)
> - O que observar (UI/console/dados)
> - Benefícios (cliente vs REVO)
> - “Estado da Arte”: por que já é / o que falta

### 2.1 Cadastros (Clientes, Produtos, Serviços, Transportadoras)
**Caminho**
- `Cadastros > Clientes`
- `Cadastros > Produtos`
- `Cadastros > Serviços`
- `Cadastros > Transportadoras` (e afins)

**Happy path**
- Criar, editar, listar, buscar.
- Importar/Exportar (CSV) onde existir.

**Segurança/permissão**
- Usuário sem `cadastros.view`: não acessa rota.
- Usuário com `view` mas sem `update`: não consegue editar/salvar.

**O que observar**
- Validação forte (CPF/CNPJ, e-mail/telefone quando aplicável).
- Mensagens de erro claras e orientadas (“como corrigir”).

**Vantagens para o cliente**
- Cadastro rápido, consistente e “sem sujeira”.

**Vantagens para a REVO**
- Menos dados ruins → menos suporte em NF/financeiro/relatórios.

**Estado da Arte (por quê / falta)**
- Por quê: validação forte + import/export + UX consistente.
- Falta comum (quando aplicável): dedupe inteligente e alertas de duplicidade.

---

### 2.2 Suprimentos / Estoque (inclui SUP‑STA‑01 multi‑depósito)
**Caminho**
- `Suprimentos > Estoque`
- `Suprimentos > Compras`
- `Suprimentos > Recebimentos`

**Happy path (estoque)**
1) Abrir `Suprimentos > Estoque` e buscar um produto.
2) **Selecionar Depósito** (se existir).
3) Abrir `Movimentar`:
   - Entrada: saldo sobe.
   - Saída: saldo desce.
   - Transferência: saldo sai de um depósito e entra no outro.
4) Abrir `Kardex` e validar os movimentos e saldos.
5) Exportar CSV (posição e kardex).

**Segurança/permissão**
- Sem permissão de `estoque.update`: botão de movimentar bloqueado + RPC deve negar.
- Depósito sem acesso: não lista nem movimenta (mesmo via console).

**O que observar**
- Idempotência: clique duplo não duplica movimento.
- Consistência: saldo final bate com a soma dos movimentos.

**Vantagens para o cliente**
- Controle real de estoque (inclusive por local).
- Transferências sem “planilha paralela”.

**Vantagens para a REVO**
- Menos divergência e “estoque negativo misterioso”.
- Menos suporte em inventário/PCP.

**Estado da Arte (por quê / falta)**
- Por quê: kardex confiável + permissões + multi‑depósito.
- Falta possível (se aplicável): devolução a fornecedor, landed cost, WMS light.

---

### 2.3 Vendas / PDV / Expedição
**Caminho**
- `Vendas > Pedidos`
- `Vendas > PDV`
- `Vendas > Expedição`
- `Vendas > Relatórios` / `Dashboard de vendas` (se disponível)

**Happy path (base)**
1) Criar cliente + produto.
2) Criar pedido.
3) (PDV) finalizar venda.
4) Ver status e histórico.

**Segurança/permissão**
- Usuário sem `vendas.update`: não finaliza PDV.
- Usuário sem `vendas.export`: não exporta relatórios/CSV.

**O que observar**
- Regra de desconto e trilha (“quem deu, quando”).
- Sem duplicidade em ações críticas (finalizar, estornar).

**Vantagens para o cliente**
- Fluxo de venda rápido e controlado.

**Vantagens para a REVO**
- Menos chargeback/erros operacionais.

**Estado da Arte (por quê / falta)**
- Por quê: fluxo simples + trilha de decisão + UX consistente.
- Falta comum (quando aplicável): PDV resiliente offline‑lite, expedição com eventos/SLAs.

---

### 2.4 Financeiro (Tesouraria, Pagar/Receber, Extrato, Conciliação, Relatórios)
**Caminho**
- `Financeiro > Tesouraria`
- `Financeiro > Contas a Receber`
- `Financeiro > Contas a Pagar`
- `Financeiro > Extrato`
- `Financeiro > Relatórios`

**Happy path (base)**
1) Criar contas (pagar/receber).
2) Baixar, estornar, cancelar.
3) Importar extrato (se disponível) e conciliar com sugestão.

**Segurança/permissão**
- Sem `financeiro.update`: não baixa/estorna.
- Sem acesso a conta: não enxerga lançamentos (RLS).

**O que observar**
- Saldos e extrato batem (consistência).
- Auditoria de ações críticas (quem baixou/estornou).

**Vantagens para o cliente**
- Caixa confiável (sem “saldo mágico”).
- Conciliação reduz tempo operacional.

**Vantagens para a REVO**
- Menos suporte “meu saldo não bate”.

**Estado da Arte (por quê / falta)**
- Por quê: conciliação + auditoria + idempotência.
- Falta (quando aplicável): centro de custo por lançamento + DRE simplificada.

---

### 2.5 Serviços / OS (Assistência técnica)
**Caminho**
- `Serviços > OS`
- `Serviços > Contratos` (se aplicável)
- `Serviços > Relatórios`

**Happy path**
1) Criar OS com cliente.
2) Vincular equipamento (modelo/serial/IMEI + fotos).
3) Checklist por tipo de serviço: marcar progresso.
4) Orçamento/aprovação: enviar → aprovar/reprovar com registro.
5) Comunicação: templates + log + portal simples.

**Segurança/permissão**
- Permissões por etapa: técnico sem permissão não aprova orçamento.
- Viewer só lê.

**O que observar**
- Timeline da OS coerente (eventos em ordem).
- Portal não vaza dados entre empresas.

**Vantagens para o cliente**
- Fluxo de assistência rápido, transparente e rastreável.

**Vantagens para a REVO**
- Menos suporte “qual o status da OS?” (cliente vê).

**Estado da Arte (por quê / falta)**
- Por quê: checklists, comunicação, portal, auditoria, UX.
- Falta comum (quando aplicável): SLA/filas mais avançadas e automações.

---

### 2.6 Indústria (OP/OB, execução, qualidade, relatórios)
**Caminho**
- `Indústria > ...` (OP/OB, execução, roteiros/BOM, qualidade, relatórios)

**Happy path**
1) Criar roteiro + BOM.
2) Criar OP/OB e avançar estados (travado quando não pode).
3) Execução: apontar operação e validar consistência.
4) Qualidade: motivos/planos/lotes/bloqueio (se aplicável).

**Segurança/permissão**
- Operador com permissão limitada (tela do operador).
- Estados não podem ser “pulados” por console.

**O que observar**
- Consistência de estados e auditoria.
- Sem inconsistências de estoque por consumo/produção.

**Vantagens para o cliente**
- Controle real de produção com rastreabilidade.

**Vantagens para a REVO**
- Menos implantação “consultoria disfarçada” (processo guiado).

**Estado da Arte (por quê / falta)**
- Por quê: wizard + travas + execução consistente.
- Falta comum: relatórios industriais mais completos e MRP/capacidade.

---

### 2.7 Configurações (Empresa, Onboarding, Papéis/Permissões)
**Caminho**
- `Configurações > Geral`
- `Configurações > Onboarding`
- `Configurações > Papéis e permissões`

**Happy path**
1) Entrar no assistente/checklist e concluir itens mínimos.
2) Validar que módulos críticos só liberam ações quando configuração mínima estiver OK (sem travar navegação).
3) Ajustar permissões e validar enforcement.

**Vantagens para o cliente**
- Primeiro uso guiado e com sensação de controle.

**Vantagens para a REVO**
- Menos onboarding manual e menos suporte inicial.

**Estado da Arte (por quê / falta)**
- Por quê: gating “suave” + wizard + enforcement 3 camadas.
- Falta comum: roadmap por plano mais completo e ajuda contextual por página.

---

### 2.8 Desenvolvedor / Operação (logs, saúde, reprocesso)
**Caminho**
- `Desenvolvedor > Logs`
- `Desenvolvedor > Saúde` (quando existir)

**Happy path**
- Ver eventos recentes, filtrar e entender falhas.
- Reprocessar job/webhook sem duplicar.

**Vantagens para o cliente**
- (Normalmente invisível, mas melhora disponibilidade e confiabilidade.)

**Vantagens para a REVO**
- Debug rápido → menos tempo de incidentes.
- Menos “caça ao erro no console”.

**Estado da Arte (por quê / falta)**
- Por quê: observabilidade + reprocesso idempotente.
- Falta comum: métricas mais ricas e runbooks/alertas mais completos.

---

## 3) Checklist final de aprovação (antes de ligar o “modo venda”)

- [ ] Rodar o fluxo Jornada A completo (empresa nova → 1ª venda/OS/estoque) sem erros.
- [ ] RBAC: validar 2 perfis (Owner vs Viewer) em 3 módulos.
- [ ] Console: `console-sweep` (e2e) passa.
- [ ] Actions no GitHub: tudo verde no PR.
- [ ] Drift DEV vs PROD: sem divergências.
- [ ] Backup/DR: última execução OK.

## 4) Próximo passo sugerido (para manter o manual vivo)

Criar uma rotina semanal:
- Rodar uma “rodada rápida” (Jornada A) em PROD.
- Se algo falhar: issue + correção via migration/PR.
- Atualizar este manual com o aprendizado (um parágrafo por falha recorrente).

