# LGPD-01 — Inventário de dados pessoais (mínimo vendável)

Objetivo: saber **quais dados pessoais coletamos**, **por que**, **onde guardamos**, **quem acessa** e **por quanto tempo**, para reduzir risco e habilitar as próximas etapas (export do titular, retenção/expurgo, minimização de logs).

## 1) Definições rápidas

- **Dados pessoais**: qualquer informação que identifique ou possa identificar uma pessoa (nome, e-mail, telefone, CPF, endereço).
- **Dados pessoais sensíveis**: saúde, biometria, religião, etc. (evitar coletar; se existir, tratar como P0).
- **Titular**: pessoa física (usuário do sistema ou contato de cliente/fornecedor).
- **Controlador**: a empresa cliente (quem decide finalidades).
- **Operador**: Revo (quem processa em nome do controlador).

## 2) Inventário (onde ficam os dados)

### 2.1 Autenticação e contas

**Origem**: Supabase Auth.

- **`auth.users`** (Supabase)
  - Campos típicos: e-mail, metadados do usuário, timestamps.
  - Finalidade: autenticação, recuperação de conta, segurança.
  - Acesso: Supabase/Auth; service role; políticas internas.
  - Retenção: enquanto a conta existir (definir regra de expurgo quando usuário solicitar).

### 2.2 Empresas (perfil)

- **`public.empresas`**
  - Campos pessoais possíveis: `email`, `telefone`, `endereco_*` (logradouro, etc.).
  - Pode conter **dados corporativos** (CNPJ) e **dados de contato**.
  - Finalidade: emissão de documentos, comunicação e relatórios.
  - Acesso: usuários vinculados à empresa via RLS/RPC.
  - Retenção: enquanto a empresa cliente existir; expurgo conforme política.

### 2.3 Usuários por empresa (multi-tenant)

- **`public.empresa_usuarios`**
  - Campos: `user_id`, `empresa_id`, papel/role.
  - Finalidade: autorização (RBAC) e isolamento multi-tenant.
  - Acesso: RLS + RPCs.
  - Retenção: enquanto vínculo existir; auditoria de mudanças recomendada.

### 2.4 Cadastros (clientes/fornecedores)

- **`public.pessoas`**
  - Campos pessoais típicos: `nome`, `email`, `telefone`, `doc_unico` (pode ser CPF), endereço, observações.
  - Finalidade: operação do ERP (vendas, compras, OS, fiscal).
  - Acesso: sempre escopado por `empresa_id` + RLS/RPC.
  - Retenção: conforme contrato do cliente; ideal ter soft delete e expurgo programado.

### 2.5 Fiscal

- **`public.fiscal_nfe_emissoes`**
  - Pode conter dados de destinatário (pessoa física) e itens/valores.
  - Finalidade: emissão e rastreabilidade fiscal.
  - Retenção: normalmente longa (obrigações legais); definir política por país/UF.

- **`public.fiscal_nfe_emitente`**
  - Dados do emitente (empresa) e eventualmente certificados/configurações.
  - Finalidade: emissão NF-e.
  - Observação: certificado é altamente sensível (tratar como “segredo”).

### 2.6 Financeiro

- **`public.financeiro_movimentacoes`**
  - Pode conter descrições/documentos e referências a cliente/fornecedor.
  - Finalidade: controle financeiro e auditoria.
  - Retenção: normalmente longa (contábil/fiscal); definir política.

### 2.7 Logs e auditoria (atenção)

- **`public.audit_logs`**
  - Pode registrar ações em tabelas com identificadores.
  - Finalidade: segurança, trilha de auditoria, suporte.

- **`public.app_logs`**
  - Finalidade: diagnóstico e métricas.
  - Regra: **não logar PII** desnecessária; sempre preferir IDs e payload saneado.

## 3) Fluxos externos (terceiros)

### 3.1 Focus NF-e
- Dados enviados: informações fiscais da NF-e (podem conter dados pessoais).
- Segredos: API key + HMAC em secrets do ambiente (GitHub/Supabase), não em tabela.
- Controles: rotação, least privilege, logs saneados.

### 3.2 Stripe
- Dados enviados: e-mail do cliente, preço/plano, status de assinatura.
- Controles: webhooks assinados, secrets em ambiente, mínimo de dados no app.

### 3.3 Marketplaces
- Dados recebidos: pedidos, cliente final, entrega, pagamentos.
- Controles: OAuth, expiração de token, diagnóstico e rotação.

## 4) Base legal (placeholder para preencher)

Preencher por operação:
- Execução de contrato
- Legítimo interesse
- Obrigação legal/regulatória (fiscal/contábil)
- Consentimento (evitar quando não for necessário)

## 5) Retenção (placeholder mínimo)

Definir:
- Retenção padrão por tabela (ex.: 5 anos fiscal, 2 anos logs, etc.)
- Soft delete vs hard delete
- Processo de expurgo seguro (por empresa)

## 6) Ações derivadas (próximos itens do checklist)

- `LGPD-02`: export do titular (por usuário e por pessoa cadastrada, quando aplicável)
- `LGPD-03`: retenção/expurgo (jobs programados, com auditoria)
- `LGPD-04`: minimização/saneamento de logs (sem PII em `app_logs`/DLQs)
