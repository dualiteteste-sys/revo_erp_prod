# LGPD-02 — Procedimento Operacional: Solicitações de Titulares

Complementa `docs/lgpd-01-inventario-dados-pessoais.md` (o quê coletamos).
Este documento define **como responder** a solicitações de titulares de dados pessoais.

---

## 1) Contexto legal (LGPD — Lei 13.709/2018)

- **Titular**: pessoa física cujos dados pessoais são tratados.
- **Controlador**: a empresa cliente do Revo (decide finalidades e meios).
- **Operador**: Revo/Ultria (processa em nome do controlador).
- **Responsabilidade:** o Controlador (empresa cliente) é responsável por responder ao Titular. O Revo é o Operador e deve fornecer ferramentas e suporte para isso.

**Prazo legal:** 15 dias corridos a partir do recebimento da solicitação válida (Art. 19 LGPD).

---

## 2) Tipos de solicitação e procedimento

### 2.1 Acesso / Export de dados

**O que o titular pode pedir:** "Quero saber quais dados pessoais você tem sobre mim."

**Procedimento:**

1. Confirmar identidade do solicitante (e-mail + CPF ou outra prova).
2. Coletar os dados das seguintes fontes (ver `lgpd-01` para inventário completo):
   - `auth.users`: e-mail, timestamps de criação/login.
   - `public.pessoas`: nome, CPF/CNPJ, e-mail, telefone, endereços, observações.
   - `public.empresa_usuarios`: papel/role, data de criação do vínculo.
   - Dados transacionais (pedidos, OS, financeiro) vinculados ao CPF/e-mail.
3. Gerar export em formato legível (JSON ou CSV).
4. Enviar ao titular com confirmação de entrega.
5. Registrar em `audit_logs` (entidade: `lgpd_export`, ação: `titular_request`).

**Query de referência (adaptar por caso):**

```sql
-- Localizar pessoa pelo e-mail
SELECT p.id, p.nome, p.email, p.telefone, p.doc_unico, p.endereco_logradouro
FROM public.pessoas p
WHERE p.empresa_id = <EMPRESA_ID>
  AND (p.email ILIKE <EMAIL_TITULAR> OR p.doc_unico = <CPF_TITULAR>);

-- Localizar usuário pelo e-mail
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE email ILIKE <EMAIL_TITULAR>;
```

**Tempo estimado:** 2-4h de trabalho técnico + revisão.

---

### 2.2 Correção de dados

**O que o titular pode pedir:** "Meu nome/e-mail/endereço está errado."

**Procedimento:**

1. Confirmar identidade do solicitante.
2. Identificar os campos a corrigir e os registros afetados.
3. Executar a correção via:
   - Interface administrativa do Revo (painel do admin da empresa cliente), ou
   - SQL direto via migration idempotente (se não houver interface adequada).
4. **Se via SQL:** escrever migration em `supabase/migrations/YYYYMMDD_fix_lgpd_correcao_titular.sql`, PR → CI → merge → aplicar.
5. Confirmar ao titular que a correção foi realizada e em quais sistemas.
6. Registrar em `audit_logs`.

---

### 2.3 Exclusão / Anonimização ("direito ao esquecimento")

**O que o titular pode pedir:** "Quero que meus dados sejam excluídos."

**Limitações legais:** dados podem ser retidos quando:
- Houver obrigação legal (ex: NF-e deve ser arquivada por 5 anos).
- Houver legítimo interesse (ex: histórico de contratos em execução).
- Dados forem necessários para defesa em processo judicial.

**Procedimento:**

1. Avaliar se há impedimento legal para exclusão total.
2. Se não houver impedimento:
   - Anonimizar dados pessoais identificáveis (`nome`, `email`, `telefone`, `doc_unico`, `endereco_*`) com valores neutros (ex: `"[REMOVIDO]"`, `NULL`).
   - **Não deletar** registros transacionais completos (pedidos, NF-e, movimentações financeiras) — apenas anonimizar os campos PII.
3. Se houver impedimento:
   - Notificar o titular dos dados que serão mantidos e a base legal.
   - Anonimizar apenas o que for possível.
4. Executar via migration idempotente (nunca SQL direto em prod sem migration).
5. Registrar em `audit_logs` com `{ action: 'lgpd_anonymize', titular_id: '...', campos_removidos: [...] }`.

**Script de referência (adaptar por caso):**

```sql
-- Migration de anonimização (exemplo)
UPDATE public.pessoas
SET
  nome = '[TITULAR REMOVIDO]',
  email = NULL,
  telefone = NULL,
  doc_unico = NULL,
  endereco_logradouro = NULL,
  endereco_complemento = NULL,
  updated_at = now()
WHERE id = '<PESSOA_ID>'
  AND empresa_id = '<EMPRESA_ID>';
```

---

### 2.4 Portabilidade de dados

**O que o titular pode pedir:** "Quero meus dados em formato interoperável para levar para outro sistema."

**Procedimento:**
- Similar ao export (seção 2.1), mas o formato deve ser estruturado (JSON ou CSV padronizado).
- Incluir: dados cadastrais, histórico de pedidos/OS/financeiro vinculados ao CPF/e-mail.
- Excluir: dados de outros titulares, informações de negócio proprietárias da empresa cliente.

---

## 3) Como a solicitação chega ao Revo

O Revo é Operador. A solicitação chega ao Controlador (empresa cliente) que então solicita suporte técnico ao Revo.

**Canal:** suporte via WhatsApp/e-mail do Revo → triagem → execução técnica.

**Formulário mínimo que o Controlador deve fornecer ao Titular:**
- Tipo de solicitação (acesso / correção / exclusão / portabilidade)
- Nome completo + CPF + e-mail do titular
- Descrição do pedido
- Data da solicitação (para controle do prazo de 15 dias)

---

## 4) Registro de solicitações

Manter log de todas as solicitações atendidas (para demonstração de conformidade):

```
data_solicitacao: YYYY-MM-DD
tipo: acesso | correcao | exclusao | portabilidade
titular_email: <hash ou mascarado>
empresa_cliente: <nome>
prazo_limite: <data_solicitacao + 15 dias>
status: pendente | concluido | rejeitado_por_lei
data_conclusao: YYYY-MM-DD
observacoes: <campo livre>
```

Armazenar em planilha interna segura ou sistema de tickets (não no banco de dados de produção).

---

## 5) Incidentes de segurança (vazamento de dados)

Em caso de vazamento que afete dados pessoais:

1. **Containment imediato:** identificar e isolar a fonte do vazamento.
2. **Notificação interna:** alertar o time técnico + responsável pela empresa.
3. **Avaliação de risco:** quantos titulares afetados? Quais dados? Há risco de dano?
4. **Notificação à ANPD:** obrigatória em até 72h se o incidente for de alto risco (Art. 48 LGPD).
5. **Notificação aos titulares:** se o risco for alto, notificar diretamente.
6. **Registro:** documentar em `docs/transfer-pack/postmortem.md`.

---

## 6) Referências

- Inventário de dados: `docs/lgpd-01-inventario-dados-pessoais.md`
- Auditoria de mudanças: `audit_logs` table (triggers em tabelas críticas)
- Retenção de dados: Supabase PITR + workflows de R2 (`docs/backups.md`)
- Workflow de retention automático: `.github/workflows/lgpd-retention-prod.yml`

---

## Última atualização — 2026-03-06

- Documento criado como parte do planejamento LGPD-02.
- Estado atual: procedimento definido. Implementação técnica de interface de export/anonimização é item P8 do backlog.
- Próximo passo: criar RPC `lgpd_export_titular` e `lgpd_anonymize_titular` para automatizar os procedimentos manuais desta doc.
