# Onboarding “Gate Suave” (sem fricção) — REVO ERP

Objetivo: o usuário **entra no sistema imediatamente após confirmar o e‑mail**, sente o capricho do produto, e **só é “travado” quando tentar executar ações que realmente dependem de configuração mínima**.

Em outras palavras: **navegar é livre; executar o que exige setup é guiado**.

---

## 1) Ideia central (em linguagem simples)

Pense em um aeroporto:

- Você pode **entrar no aeroporto** e ver tudo (lojas, painéis, portões).
- Mas para **embarcar**, precisa de check-in, documento e passar pela segurança.

No Revo:

- O usuário pode **entrar no app e explorar** (encantamento + confiança).
- Mas para **emitir NF-e / finalizar PDV / gerar cobrança**, precisa concluir o mínimo.

---

## 2) Princípios (o que nunca pode acontecer)

1) **Nunca “bloquear o app inteiro” por falso-positivo**
   - Se uma checagem falhar por RLS/erro/transiente, o app não pode virar “tela preta”.
   - Fallback seguro: mostrar “Não consegui validar; tente novamente” e permitir navegação.

2) **Travamento só em ação crítica**
   - Ex.: abrir “Fiscal → Configurações” pode ser livre.
   - “Fiscal → Emitir NF-e” (enviar para provedor) pode exigir emitente/série.

3) **Controle e autonomia**
   - Mensagens no tom “Você pode concluir agora” (não “Você deve”).
   - Sempre existir “Fazer depois” quando não for bloqueio técnico.

4) **Contexto**
   - O usuário entende *por que* está bloqueado e *como* resolver em 1 clique.

---

## 3) Fluxo recomendado (do e‑mail confirmado ao “primeiro valor”)

### 3.1 Após confirmação de e‑mail
1) Redirecionar para `/app` (sem “fricção” extra).
2) Mostrar uma tela rápida (ou banner) de “Bem‑vindo” com:
   - “Configuração inicial: X/Y”
   - Botão **“Concluir configurações”**
   - Botão “Explorar por conta própria” (continua no app)

### 3.2 A qualquer momento no app (sempre visível, sem incomodar)
No header do layout (global):
- Um “chip/badge” discreto: **“Configuração inicial: X/Y”**
- Um CTA: **“Concluir configurações”**

Por módulo (contextual):
- Em telas onde uma ação está bloqueada, mostrar:
  - tooltip com o motivo
  - botão “Abrir Assistente nesse passo”

---

## 4) A interface (UX) — o que o usuário vê

### 4.1 Banner global (recomendado)
Local: topo do `MainLayout` (abaixo do header, acima do conteúdo).

Conteúdo:
- **Título:** “Configuração inicial”
- **Progresso:** “2/5 concluídas”
- **Texto curto:** “Conclua o mínimo para emitir, receber e controlar seu caixa.”
- **Botões:** “Concluir configurações” + “Ocultar por agora”

Regras:
- “Ocultar por agora” só esconde por sessão (ou 24h), mas o **chip no header** fica.
- Se o usuário completar tudo, o banner some permanentemente.

### 4.2 Assistente (wizard)
Regras de ouro do wizard:
- Abre em **modal** (não navega e não “perde” o contexto).
- Cada etapa tem:
  - campos mínimos
  - validação clara
  - “Salvar e continuar”
  - “Voltar”
- Ao salvar com sucesso:
  - fecha o modal da etapa
  - volta para o wizard com check verde e próximo passo

---

## 5) Matriz de bloqueios (o que bloqueia o quê)

O segredo do “gate suave” é bloquear apenas o que é **tecnicamente necessário**.

### 5.1 Itens mínimos (sugestão MVP)

1) **Empresa (cadastro básico)**
   - Nome fantasia/razão social, CNPJ (se aplicável), endereço (mínimo), telefone.
   - Bloqueia: quase nada. (Serve mais para “qualidade do cadastro”.)

2) **Financeiro → Conta padrão**
   - Pelo menos 1 conta corrente/caixa ativa
   - Definir “padrão para recebimentos” e “padrão para pagamentos”
   - Bloqueia:
     - finalizar PDV (gera entrada)
     - baixar conta a receber/pagar (gera movimentação)

3) **Centros de custo (se plano/feature ativo)**
   - Se `centros_de_custo` estiver ativo, exigir pelo menos 1 centro
   - Bloqueia:
     - lançamentos financeiros quando a alocação for obrigatória

4) **Fiscal → Emitente**
   - Emitente + ambiente + série/numeração
   - Bloqueia:
     - envio de NF-e ao provedor (emitir)

5) **Serviços (opcional)**
   - Se o cliente usa OS, exigir só o mínimo para gerar financeiro (ex.: forma padrão)
   - Bloqueia:
     - “Concluir OS gerando parcela” (se OS→Financeiro estiver ligado)

### 5.2 Exemplos práticos (como deve aparecer)

- Usuário clica em **“Finalizar PDV”** sem conta padrão:
  - Botão desabilitado
  - Tooltip: “Defina uma conta padrão para recebimentos (Tesouraria).”
  - CTA: “Abrir Assistente nesse passo”

- Usuário clica em **“Emitir NF-e”** sem emitente/série:
  - Ação bloqueada
  - Mensagem: “Para emitir, precisamos do emitente e da numeração.”
  - CTA: “Configurar agora”

---

## 6) Modelagem técnica (como implementar sem gambiarra)

### 6.1 Fonte de verdade das checks
Recomendação: **RPC de “onboarding status”** (server-side), com resultado estável:
- `rpc/onboarding_status_for_current_empresa`
  - retorna lista de passos `{ key, title, status: 'ok'|'pending'|'blocked', required, cta_route, missing_fields[] }`

Por quê?
- Evita múltiplos `HEAD/GET` no front (e evita 403).
- Centraliza regra e reduz drift.

### 6.2 Onde gravar progresso
Não precisa “salvar progresso” manualmente se os checks são derivados do banco.
Mas é útil gravar:
- `onboarding_dismissed_until` (por user/empresa)
- `onboarding_completed_at` (por empresa)

### 6.3 Gate por ação crítica
Padrão recomendado no front:
- Cada ação crítica chama um guard:
  - `ensureOnboarding('pdv.finalize')`
  - `ensureOnboarding('nfe.emit')`
- Se não ok:
  - abrir modal do assistente já no passo correto
  - não executar a ação

---

## 7) Copy (textos prontos, tom acolhedor)

### Banner global
- Título: “Configuração inicial”
- Texto: “Conclua o mínimo para emitir, receber e controlar seu caixa com segurança.”
- Botões: “Concluir configurações” / “Ocultar por agora”

### Tooltip de bloqueio
- “Para concluir isso, falta: {item}. Clique para abrir o assistente.”

### Sucesso
- “Perfeito — etapa concluída. Vamos para a próxima?”

---

## 8) Critérios de aceite (para dizer “feito”)

1) Usuário confirma e-mail e entra no app sem travas globais.
2) Banner global mostra progresso e abre wizard em modal.
3) Ações críticas bloqueiam apenas quando necessário e levam ao passo correto.
4) Ao salvar uma etapa válida, o wizard marca check verde e permite avançar.
5) Sem erros de console (RG‑03) e com E2E verde (RG‑04).

---

## 9) Como validar (manual)

1) Criar empresa nova (perfil owner).
2) Entrar no app: ver banner + chip de progresso.
3) Tentar:
   - Finalizar PDV sem conta padrão → deve bloquear e abrir assistente em “Tesouraria”.
   - Emitir NF-e sem emitente → deve bloquear e abrir “Emitente/Série”.
4) Preencher requisitos mínimos:
   - salvar e voltar ao wizard com check verde.
5) Repetir ação crítica e confirmar que agora executa.

