# Manual Operacional: Fluxo Completo de Beneficiamento

**Da Entrada do XML do Fornecedor ate a Emissao da NF-e Autorizada pela SEFAZ**

> Documento de referencia interna — Dualite / Revo ERP
> Ultima atualizacao: 2026-03-14

---

## Indice

1. [Visao Geral do Fluxo](#1-visao-geral-do-fluxo)
2. [Pre-requisitos (Configuracao Inicial)](#2-pre-requisitos-configuracao-inicial)
3. [ETAPA 1 — Entrada de NF-e via XML](#3-etapa-1--entrada-de-nf-e-via-xml)
4. [ETAPA 2 — Classificacao como Material do Cliente](#4-etapa-2--classificacao-como-material-do-cliente)
5. [ETAPA 3 — Criacao da Ordem de Beneficiamento (OB)](#5-etapa-3--criacao-da-ordem-de-beneficiamento-ob)
6. [ETAPA 4 — Acompanhamento e Conclusao da OB](#6-etapa-4--acompanhamento-e-conclusao-da-ob)
7. [ETAPA 5 — Faturamento da OB](#7-etapa-5--faturamento-da-ob)
8. [ETAPA 6 — Revisao e Emissao da NF-e de Saida](#8-etapa-6--revisao-e-emissao-da-nf-e-de-saida)
9. [ETAPA 7 — Pos-Emissao (DANFE, XML, Financeiro)](#9-etapa-7--pos-emissao-danfe-xml-financeiro)
10. [Cenario Complementar: Retorno de Vasilhame](#10-cenario-complementar-retorno-de-vasilhame)
11. [Referencia: Mapa DANFE x Campos do Revo](#11-referencia-mapa-danfe-x-campos-do-revo)
12. [Troubleshooting — Problemas Comuns](#12-troubleshooting--problemas-comuns)
13. [Checklist Rapido de Validacao](#13-checklist-rapido-de-validacao)

---

## 1. Visao Geral do Fluxo

```
 FORNECEDOR envia XML da NF-e
          |
          v
 [1] ENTRADA NF-e via XML .............. Ferramentas > Importar XML
          |
          v
 [2] CLASSIFICAR MATERIAL DO CLIENTE ... Industria > Materiais de Clientes
          |
          v
 [3] CRIAR ORDEM DE BENEFICIAMENTO ..... Industria > OP / OB
          |
          v
 [4] EXECUTAR / CONCLUIR A OB .......... Industria > OP / OB (alterar status)
          |
          v
 [5] FATURAR A OB ...................... Botao "Faturar" na OB concluida
          |
          v
 [6] REVISAR E EMITIR NF-e ............ Fiscal > NF-e (rascunho auto-criado)
          |
          v
 [7] NF-e AUTORIZADA .................. DANFE + XML disponiveis
```

**Tempo estimado para um operador treinado:** 5-10 minutos (excluindo tempo de beneficiamento fisico).

**Rastreabilidade completa:** Cada NF-e de saida contem links para o pedido de venda, a OB, e a NF-e de entrada original.

---

## 2. Pre-requisitos (Configuracao Inicial)

Antes de iniciar o fluxo, confirme que as configuracoes abaixo estao feitas. Sao configuracoes unicas — uma vez feitas, valem para todas as operacoes futuras.

### 2.1 Emitente Fiscal

**Menu:** Fiscal > Configuracoes

Preencher todos os campos do emitente (sua empresa):

| Campo | Exemplo DANFE | Observacao |
|-------|---------------|------------|
| CNPJ | 12.345.678/0001-90 | Sem pontuacao no banco, formatado na DANFE |
| Razao Social | METALTORK INDUSTRIA LTDA | Aparece no cabecalho da DANFE |
| Nome Fantasia | METALTORK | Opcional, aparece abaixo da razao social |
| Inscricao Estadual | 123.456.789.001 | Obrigatorio para emissao |
| CRT (Regime Tributario) | 3 = Regime Normal | 1=Simples Nacional, 3=Normal |
| Endereco completo | Rua, Numero, Bairro, Cidade, UF, CEP | Todos obrigatorios na DANFE |
| Codigo Municipio IBGE | 3550308 | 7 digitos, usado no XML |
| Token Focus NFe | (chave da API) | Homologacao e/ou Producao |

### 2.2 Naturezas de Operacao

**Menu:** Fiscal > Naturezas de Operacao

Para beneficiamento, as naturezas essenciais sao:

| Codigo | Descricao | CFOP Dentro UF | CFOP Fora UF | Uso |
|--------|-----------|----------------|--------------|-----|
| RET_COBR | Retorno e Cobranca de Beneficiamento | 5124 | 6124 | NF-e de saida do beneficiamento |
| REM_BENEF | Remessa para Beneficiamento | 5901 | 6901 | Quando voce envia material para terceiro beneficiar |
| RET_BENEF | Retorno de Beneficiamento | 5902 | 6902 | Retorno de material beneficiado por terceiro |
| VENDA | Venda de Mercadoria | 5102 | 6102 | Venda direta (sem beneficiamento) |

**Como cadastrar uma natureza (exemplo RET_COBR):**

1. Clique em **"+ Nova natureza"**
2. Preencha:
   - **Codigo:** `RET_COBR`
   - **Descricao:** `Retorno e Cobranca de Beneficiamento`
   - **Tipo de Operacao:** Saida
   - **Finalidade de Emissao:** 1 — Normal
   - **CFOP Dentro UF:** `5124`
   - **CFOP Fora UF:** `6124`
   - **ICMS CST:** `90` (Outras) ou conforme orientacao contabil
   - **ICMS Aliquota:** `18` (ou a aliquota do seu estado)
   - **PIS CST:** `99`, Aliquota: `0`
   - **COFINS CST:** `99`, Aliquota: `0`
   - **Gera financeiro:** Sim (marcado)
   - **Movimenta estoque:** Sim (marcado)
3. Clique em **"Criar natureza"**

### 2.3 Condicoes de Pagamento

**Menu:** Financeiro > Condicoes de Pagamento

Cadastre as condicoes que voce usa com seus clientes:

| Nome | Condicao | Resultado |
|------|----------|-----------|
| A vista | 0 | 1 duplicata com vencimento na data da emissao |
| 30 dias | 30 | 1 duplicata com vencimento em 30 dias |
| 30/60/90 | 30/60/90 | 3 duplicatas iguais com vencimentos escalonados |
| 28 DDL | 28 | 1 duplicata com vencimento em 28 dias |

### 2.4 Transportadoras

**Menu:** Logistica > Transportadoras

Cadastre pelo menos uma transportadora se suas NF-e exigem dados de transporte. Marque uma como "Padrao para frete" para que ela seja automaticamente selecionada ao gerar NF-e.

### 2.5 Cadastro de Clientes

**Menu:** Cadastros > Pessoas

Cada cliente (destinatario da NF-e) precisa ter:
- CPF ou CNPJ
- Endereco completo (logradouro, numero, bairro, cidade, UF, CEP, codigo IBGE)
- Inscricao Estadual (se contribuinte ICMS)
- Email (opcional, mas recomendado para envio automatico da DANFE)

**IMPORTANTE:** Se algum campo de endereco estiver faltando, a emissao sera bloqueada com erro "DESTINATARIO_INCOMPLETO" listando os campos ausentes.

### 2.6 Cadastro de Produtos

**Menu:** Cadastros > Produtos

Cada produto precisa de:
- NCM (8 digitos) — obrigatorio na NF-e
- Unidade de medida
- Preco de venda (usado como padrao no faturamento)
- Peso bruto e liquido em kg (opcional, mas recomendado — propagado automaticamente para a NF-e)

---

## 3. ETAPA 1 — Entrada de NF-e via XML

**Menu:** Ferramentas > Importar XML
**URL:** `/app/nfe-input`

### O que e esta etapa?

Quando o fornecedor/cliente envia material para beneficiamento, ele emite uma NF-e. Voce recebe o arquivo XML dessa NF-e e importa no sistema para dar entrada no material.

### Passo a passo:

**Passo 1 — Upload do XML**
1. Acesse **Ferramentas > Importar XML**
2. Arraste o arquivo `.xml` da NF-e para a area de upload (ou clique para selecionar)
3. O sistema parseia o XML e exibe um resumo:
   - Numero e serie da NF-e
   - Nome do emitente (fornecedor/cliente)
   - Valor total
   - Lista de itens com quantidades e valores
4. Clique em **"Prosseguir"**

**Passo 2 — Vinculos (Match de Produtos)**

O sistema tenta vincular automaticamente cada item do XML com produtos do seu cadastro:
- **Match por SKU:** codigo do produto no XML = codigo no seu cadastro
- **Match por EAN:** codigo de barras do XML = EAN no seu cadastro
- **Sem match:** voce precisa vincular manualmente

Para cada item sem match automatico:
1. Clique no campo de produto
2. Busque e selecione o produto correto do seu cadastro
3. O badge muda de "Sem match" para "Manual"

Clique em **"Prosseguir"** quando todos os itens estiverem vinculados.

**Passo 3 — Conferencia**

Confira a quantidade recebida fisicamente:
1. Para cada item, informe a **quantidade conferida** (pode ser diferente do XML se houve divergencia)
2. Se o produto tem lote, o sistema pre-preenche com o lote do XML — voce pode alterar
3. Clique em **"Finalizar"**

**Resultado:** O estoque e atualizado automaticamente. Os itens sao registrados como "recebidos" vinculados a esta NF-e de entrada.

### Verificacao:

- Toast verde: "Recebimento processado com sucesso!"
- Tela avanca para o passo "Sucesso" mostrando um resumo
- No menu Estoque, os saldos dos produtos recebidos devem ter aumentado

---

## 4. ETAPA 2 — Classificacao como Material do Cliente

**Menu:** Industria > Materiais de Clientes
**URL:** `/app/industria/materiais-cliente`

### O que e esta etapa?

Quando o material recebido pertence ao cliente (ele enviou para voce beneficiar), voce classifica esse recebimento como "Material do Cliente". Isso diferencia material proprio de material de terceiros no controle de estoque.

### Passo a passo:

1. Acesse **Industria > Materiais de Clientes**
2. Clique em **"Classificar Recebimento"**
3. No modal que abre:
   - **Recebimento:** selecione o recebimento da NF-e que voce acabou de importar
     - O dropdown mostra: `NF {numero}/{serie} - {nome_emitente} ({status})`
   - **Cliente (dono do material):** busque e selecione o cliente que enviou o material
4. Clique em **"Confirmar"**

**Resultado:** O sistema cria/atualiza registros na tabela de materiais do cliente, vinculando cada produto recebido ao dono.

### Alternativa — Cadastro manual:

Se o material nao veio via NF-e (ex: entrega informal, amostra):
1. Clique em **"Novo Material"**
2. Preencha:
   - **Cliente** (obrigatorio)
   - **Produto** (obrigatorio)
   - **Codigo do Cliente** (codigo que o cliente usa para esse produto)
   - **Unidade de Medida**
3. Clique em **"Salvar"**

---

## 5. ETAPA 3 — Criacao da Ordem de Beneficiamento (OB)

**Menu:** Industria > OP / OB
**URL:** `/app/industria/ordens?tipo=beneficiamento`

### O que e esta etapa?

A Ordem de Beneficiamento (OB) e o documento interno que controla o processo de beneficiamento: qual produto sera beneficiado, em que quantidade, para qual cliente, com que prazo.

### Passo a passo:

1. Acesse **Industria > OP / OB**
2. Certifique-se de que o filtro de tipo esta em **"Beneficiamento"**
3. Clique em **"Nova Ordem"**
4. O formulario abre em 3 passos (wizard):

**Passo 1 de 3 — Produto e Quantidade**

| Campo | Preenchimento | Exemplo |
|-------|---------------|---------|
| Tipo de Ordem | Beneficiamento (ja selecionado) | — |
| Cliente | Busque o cliente dono do material | METALTORK INDUSTRIA |
| Material do Cliente | Selecione o material (opcional) | Aco SAE 1045 |
| Produto | Busque o produto final do beneficiamento | Flange Beneficiada |
| Quantidade Planejada | Informe a quantidade a produzir | 500 |
| Unidade | Selecione a unidade | un |

Clique em **"Proximo"**

**Passo 2 de 3 — Programacao**

| Campo | Preenchimento | Exemplo |
|-------|---------------|---------|
| Status | Rascunho (padrao) | Altere para "Planejada" se ja confirmada |
| Prioridade | 0 a 100 (maior = mais urgente) | 80 |
| Inicio Previsto | Data de inicio do beneficiamento | 15/03/2026 |
| Fim Previsto | Data prevista de conclusao | 20/03/2026 |
| Entrega Prevista | Data de entrega ao cliente | 22/03/2026 |

Clique em **"Proximo"**

**Passo 3 de 3 — Revisao e Detalhes**

| Campo | Preenchimento | Exemplo |
|-------|---------------|---------|
| Qtde. de Caixas | Numero de caixas/embalagens | 10 |
| Numero da NF (cliente) | Numero da NF-e de entrada | 12345 |
| Numero do Pedido | Numero do pedido do cliente | PED-2026-001 |
| Ref. Documento | Referencia livre | Lote 2026-03 |
| Observacoes | Notas internas | Urgente - entrega express |

Clique em **"Salvar Ordem"**

### Verificacao:

- Toast verde: "Ordem criada com sucesso!"
- A OB aparece na lista com status "Rascunho" ou "Planejada"
- O numero da OB e atribuido automaticamente (ex: OB-015)

---

## 6. ETAPA 4 — Acompanhamento e Conclusao da OB

**Menu:** Industria > OP / OB
**URL:** `/app/industria/ordens`

### Fluxo de status da OB:

```
Rascunho -----> Planejada -----> Em Programacao -----> Em Beneficiamento
                                                             |
                                                             v
                                                    Parcialmente Entregue
                                                             |
                                                             v
                                                        Concluida -----> [FATURAR]
```

### Passo a passo:

1. Localize a OB na lista (use o filtro de busca ou status)
2. Clique na OB para abri-la
3. Conforme o beneficiamento avanca, altere o status:
   - **Em Programacao:** material separado, programado para maquina
   - **Em Beneficiamento:** processo em andamento
   - **Parcialmente Entregue:** parte do lote ja foi entregue
   - **Concluida:** todo o lote foi beneficiado
4. Clique em **"Salvar Ordem"** apos cada alteracao de status

### Registro de entregas parciais:

Na aba de entregas dentro da OB:
1. Clique em **"Adicionar Entrega"**
2. Informe data, quantidade e observacoes
3. Salve

### Verificacao:

- O status da OB reflete o andamento real
- O historico (audit trail) registra cada mudanca de status com data/hora e usuario

---

## 7. ETAPA 5 — Faturamento da OB

**Menu:** Dentro da propria OB (Industria > OP / OB)

### O que e esta etapa?

Quando a OB esta concluida (ou parcialmente entregue), voce "fatura" — ou seja, gera um pedido de venda e uma NF-e de saida automaticamente. Esta e a ponte entre a producao e o fiscal.

### Pre-condicoes:

- OB com status que permite faturamento (nao pode estar "cancelada" ou ja "faturada")
- Cliente cadastrado com CNPJ/CPF e endereco completo
- Natureza de operacao cadastrada (ex: RET_COBR)

### Passo a passo:

1. Abra a OB concluida
2. Clique no botao **"Faturar"** (icone de recibo, cor verde)
3. O modal **"Faturar Ordem de Beneficiamento"** abre com:

   **Resumo da OB:**
   ```
   Resumo da OB #015
   Produto: Flange Beneficiada
   Quantidade: 500 un
   ```

   **Aviso azul:**
   > "Sera criado um pedido de venda aprovado automaticamente e uma NF-e em rascunho para voce revisar antes de enviar a SEFAZ."

4. Preencha:
   - **Cliente (Destinatario):** o cliente que recebera a NF-e (ja pre-preenchido com o cliente da OB)
   - **Preco Unitario (opcional):** se deixar vazio, usa o preco de venda cadastrado no produto

5. Clique em **"Faturar"**

### O que acontece automaticamente:

O sistema executa a RPC `industria_faturar_ob` que:

1. Cria um **Pedido de Venda** com status "aprovado" automaticamente
2. Gera uma **NF-e em rascunho** chamando `fiscal_nfe_gerar_de_pedido`
3. A NF-e ja vem com:
   - Destinatario preenchido
   - Itens com quantidades e valores
   - Natureza de operacao (se VENDA estiver cadastrada como padrao)
   - CFOP automatico (dentro/fora do UF baseado no endereco do emitente vs destinatario)
   - CST/CSOSN baseado no regime tributario do emitente
   - Impostos calculados (ICMS, PIS, COFINS, IPI)
   - Duplicatas geradas pela condicao de pagamento
   - Transportadora padrao (se cadastrada)
   - Peso bruto e liquido (calculados dos produtos)
   - Volumes
4. Marca a OB como `status_faturamento = 'faturado'`
5. **Redireciona automaticamente** para a pagina de NF-e com o rascunho aberto

### Verificacao:

- Toast verde: "NF-e rascunho criada! Revise e envie para a SEFAZ."
- Voce e redirecionado para Fiscal > NF-e com o rascunho aberto
- A OB agora mostra "Faturado" no campo de status de faturamento

---

## 8. ETAPA 6 — Revisao e Emissao da NF-e de Saida

**Menu:** Fiscal > NF-e
**URL:** `/app/fiscal/nfe`

### O que e esta etapa?

Esta e a etapa final: voce revisa o rascunho da NF-e (gerado automaticamente na etapa anterior) e envia para a SEFAZ. O sistema usa a API do **Focus NFe** como camada de transmissao.

### Visao geral da tela de NF-e:

No topo da pagina voce ve cards de resumo:
- **Total de NF-e** (no periodo)
- **Rascunhos** (pendentes de envio)
- **Autorizadas** (com valor total acumulado)
- **Pendentes** (enfileiradas ou processando)

### Passo a passo — Revisar o rascunho:

O rascunho ja abre automaticamente apos o faturamento. Se nao, localize-o na lista (status "Rascunho") e clique nele.

**Secao 1 — Cabecalho (corresponde ao topo da DANFE)**

| Campo no Revo | Campo na DANFE | Preenchimento |
|---------------|----------------|---------------|
| Ambiente | — | Homologacao (testes) ou Producao (valido fiscalmente) |
| Natureza da Operacao | NATUREZA DA OPERACAO | Auto-preenchido. Ex: "Retorno e Cobranca de Beneficiamento" |
| Destinatario | DESTINATARIO/REMETENTE | Auto-preenchido pelo cliente da OB |

> **ATENCAO:** Para emissao real (que gera nota fiscal valida), o ambiente DEVE ser **Producao**. Notas em Homologacao sao apenas para teste e nao tem validade fiscal.

**Secao 2 — Pagamento**

| Campo no Revo | Campo na DANFE | Preenchimento |
|---------------|----------------|---------------|
| Forma de Pagamento | — | Selecione: Boleto, PIX, Dinheiro, Transferencia, etc. |
| Condicao de Pagamento | FATURA / DUPLICATA | Selecione: 30/60/90, A vista, etc. |

Apos selecionar a condicao de pagamento e salvar, o sistema gera automaticamente as **duplicatas** que aparecem no bloco FATURA/DUPLICATA da DANFE:

```
Exemplo com condicao "30/60/90" e total de R$ 18.222,09:
  Duplicata 001: Vencimento 15/04/2026 — R$ 6.074,03
  Duplicata 002: Vencimento 15/05/2026 — R$ 6.074,03
  Duplicata 003: Vencimento 14/06/2026 — R$ 6.074,03
```

**Secao 3 — Transporte (corresponde ao bloco TRANSPORTADOR/VOLUMES da DANFE)**

| Campo no Revo | Campo na DANFE | Preenchimento |
|---------------|----------------|---------------|
| Transportadora | RAZAO SOCIAL / CNPJ | Selecione a transportadora cadastrada |
| Modalidade de Frete | FRETE POR CONTA | 0=Emitente(CIF), 1=Destinatario(FOB), 9=Sem frete |
| Valor do Frete | — | Valor em R$ (somado ao total da NF-e) |

**Secao 4 — Peso e Volumes (corresponde ao bloco VOLUMES da DANFE)**

| Campo no Revo | Campo na DANFE | Preenchimento |
|---------------|----------------|---------------|
| Peso Bruto (kg) | PESO BRUTO | Auto-calculado dos produtos (editavel) |
| Peso Liquido (kg) | PESO LIQUIDO | Auto-calculado dos produtos (editavel) |
| Qtd. Volumes | QUANTIDADE | Numero de volumes/caixas |
| Especie | ESPECIE | VOLUMES, CAIXAS, PALETES, etc. |

**Secao 5 — Itens (corresponde ao bloco DADOS DOS PRODUTOS / SERVICOS da DANFE)**

Cada item mostra uma linha na tabela:

| Campo no Revo | Coluna na DANFE | Preenchimento |
|---------------|-----------------|---------------|
| Produto (autocomplete) | DESCRICAO DO PRODUTO/SERVICO | Nome do produto |
| NCM | NCM/SH | 8 digitos (obrigatorio) |
| CST ou CSOSN | CST | Codigo de Situacao Tributaria |
| CFOP | CFOP | Auto-preenchido pela natureza (ex: 5124 ou 6124) |
| Unidade | UN | UN, KG, PC, etc. |
| Quantidade | QTD | Quantidade do item |
| Valor Unitario | VL UNITARIO | Preco por unidade |
| Valor Desconto | VL DESC | Desconto total do item |
| Informacoes Adicionais | — | Texto livre por item (aparece no XML como infAdProd) |

**Abaixo de cada item** ha um campo para **Informacoes adicionais do item (infAdProd)**:
- Use para indicar numero de pedido do cliente, lote, validade, etc.
- Exemplo: `xPed: PED-2026-001 | Lote: L2026-03-A`

**Secao 6 — Impostos (calculados automaticamente pelo motor tributario)**

Os impostos sao calculados automaticamente quando a natureza de operacao esta selecionada:

| Imposto | Calculo | Exemplo |
|---------|---------|---------|
| ICMS | Base x Aliquota (se Regime Normal e CST permite) | R$ 6.074,03 x 18% = R$ 1.093,33 |
| PIS | Base x Aliquota (conforme natureza) | R$ 6.074,03 x 0% = R$ 0,00 |
| COFINS | Base x Aliquota (conforme natureza) | R$ 6.074,03 x 0% = R$ 0,00 |
| IPI | Base x Aliquota (se aplicavel) — somado "por fora" ao total | R$ 6.074,03 x 5% = R$ 303,70 |

> **Regra fiscal:** ICMS, PIS e COFINS sao impostos "por dentro" (ja incluidos no preco). IPI e imposto "por fora" (somado ao total da NF-e).

**Secao 7 — Totais (corresponde ao bloco CALCULO DO IMPOSTO da DANFE)**

| Campo no Revo | Campo na DANFE | Exemplo |
|---------------|----------------|---------|
| Total Produtos | BASE DE CALCULO ICMS | R$ 18.222,09 |
| Total Descontos | VALOR DO DESCONTO | R$ 0,00 |
| Total Frete | VALOR DO FRETE | R$ 500,00 |
| Total Impostos | VALOR DO IPI | R$ 911,10 (somente IPI) |
| Total NF-e | VALOR TOTAL DA NOTA | R$ 19.633,19 |

### Passo a passo — Salvar e Enviar:

1. **Revise todos os campos** — especialmente:
   - Ambiente (Producao para nota real!)
   - Natureza de operacao
   - Destinatario e endereco
   - NCM de todos os itens (8 digitos)
   - CFOP (4 digitos, correto para dentro/fora UF)
   - CST ou CSOSN preenchido

2. Clique em **"Salvar Rascunho"** para persistir as alteracoes

3. Clique em **"Enviar para SEFAZ"** (botao verde com icone de envio)

4. O sistema:
   - Valida todos os campos obrigatorios
   - Monta o payload para a API do Focus NFe
   - Envia para processamento
   - Atualiza o status para "Processando"

5. **Aguarde a resposta** — o sistema faz polling automatico a cada 5 segundos:
   - **Autorizada:** nota aprovada pela SEFAZ (badge verde)
   - **Rejeitada:** SEFAZ recusou — veja o motivo abaixo
   - **Erro:** problema tecnico — veja o detalhe do erro

### Verificacao:

- Status muda para **"Autorizada"** (badge verde)
- Numero e serie da NF-e sao atribuidos
- Chave de acesso de 44 digitos aparece
- Botoes de download ficam disponiveis (DANFE PDF e XML)

---

## 9. ETAPA 7 — Pos-Emissao (DANFE, XML, Financeiro)

### 9.1 Download da DANFE (PDF)

Apos autorizacao:
1. Na lista de NF-e, localize a nota autorizada
2. Clique no botao **"DANFE"** (icone de download)
3. O PDF da DANFE e baixado — este e o documento que acompanha a mercadoria

### 9.2 Download do XML

1. Clique no botao **"XML"** (icone de download)
2. O arquivo XML assinado e baixado — este e o documento fiscal oficial

### 9.3 Copiar Chave de Acesso

1. Clique no botao **"Copiar Chave"** (icone de copia)
2. A chave de 44 digitos e copiada para a area de transferencia
3. Use para consulta no portal da SEFAZ ou envio ao cliente

### 9.4 Duplicatas / Contas a Receber

Se a natureza de operacao tem `gera_financeiro = true` e a condicao de pagamento gerou duplicatas:
- O sistema cria automaticamente as **contas a receber** no modulo Financeiro
- Cada duplicata vira um titulo com data de vencimento e valor

Verifique em: **Financeiro > Contas a Receber**

---

## 10. Cenario Complementar: Retorno de Vasilhame

### O que e?

Quando o cliente envia material para beneficiamento, muitas vezes ele vem em vasilhames (tambores, caixas metalicas, paletes, engradados). Esses vasilhames pertencem ao cliente e precisam ser devolvidos com NF-e propria, usando CFOPs especificos:

| Operacao | CFOP Dentro UF | CFOP Fora UF | Quando usar |
|----------|----------------|--------------|-------------|
| Remessa de vasilhame | 5920 | 6920 | Voce envia vasilhame para o cliente |
| Retorno de vasilhame | 5921 | 6921 | O cliente devolve vasilhame para voce |

> **Nota:** Este fluxo e manual — nao ha automacao dedicada no sistema. Voce cria a NF-e diretamente no modulo Fiscal.

### Configuracao (uma vez)

1. Acesse **Fiscal > Naturezas de Operacao**
2. Crie duas naturezas:

   **Remessa de vasilhame:**
   - Codigo: `REM_VASILH`
   - Descricao: `Remessa de vasilhame`
   - Tipo: Saida
   - Finalidade: 1 — Normal
   - CFOP Dentro UF: `5920` / Fora UF: `6920`
   - ICMS CST: `41` (nao tributada) ou conforme orientacao contabil
   - PIS CST: `99`, Aliquota: `0`
   - COFINS CST: `99`, Aliquota: `0`
   - Gera financeiro: **Nao** (desmarcado — vasilhame nao gera cobranca)
   - Movimenta estoque: **Sim** (marcado — para controlar saldo de vasilhames)

   **Retorno de vasilhame:**
   - Codigo: `RET_VASILH`
   - Descricao: `Retorno de vasilhame`
   - Tipo: Entrada
   - Finalidade: 1 — Normal
   - CFOP Dentro UF: `5921` / Fora UF: `6921`
   - Demais campos: mesma configuracao da remessa

3. Cadastre os vasilhames como **produtos** no sistema:
   - Menu: Cadastros > Produtos
   - Nome: ex. "Tambor Metalico 200L", "Palete PBR"
   - NCM: `7310.10.90` (recipientes metalicos) ou o NCM correto do vasilhame
   - Unidade: UN
   - Preco de venda: R$ 0,00 (vasilhame nao e vendido)

### Passo a passo — Emitir NF-e de retorno de vasilhame

1. Acesse **Fiscal > NF-e**
2. Clique em **"+ Criar NF-e"**
3. Preencha o rascunho:
   - **Ambiente:** Producao (ou Homologacao para teste)
   - **Natureza de Operacao:** busque "REM_VASILH" (Remessa de vasilhame)
   - **Destinatario:** selecione o cliente dono dos vasilhames
   - **Modalidade de Frete:** conforme combinado (CIF, FOB ou sem frete)
4. Adicione os itens:
   - Busque o produto vasilhame (ex: "Tambor Metalico 200L")
   - Informe a quantidade
   - Valor unitario: R$ 0,00 (ou o valor declarado para fins de seguro/transporte)
   - O CFOP sera preenchido automaticamente pela natureza (5920 ou 6920)
5. Na secao de peso e volumes:
   - Informe o peso total dos vasilhames
   - Informe a quantidade de volumes
6. Clique em **"Salvar Rascunho"**
7. Clique em **"Enviar para SEFAZ"**

### Dica: Informacoes adicionais

No campo de informacoes adicionais do item (infAdProd), inclua a referencia da NF-e original de entrada:

```
Retorno de vasilhame ref. NF-e 12345 serie 001 de 10/03/2026
```

Isso facilita a rastreabilidade e evita questionamentos do fisco.

### Limitacoes atuais

- **Sem controle automatico de saldo:** o sistema nao rastreia "quantos vasilhames o cliente X tem conosco". Esse controle precisa ser feito manualmente ou em planilha auxiliar.
- **Sem gatilho automatico:** ao receber material do cliente, o sistema nao sugere automaticamente a emissao de NF-e de retorno de vasilhame.
- **Sem vinculo com a OB:** a NF-e de vasilhame e independente da ordem de beneficiamento.

---

## 11. Referencia: Mapa DANFE x Campos do Revo

Esta secao mapeia cada bloco da DANFE para o campo correspondente no Revo ERP. Use como referencia para conferir se os dados da nota estao corretos.

### Bloco 1 — Cabecalho (Emitente)

```
+------------------------------------------------------------------+
|  RAZAO SOCIAL DO EMITENTE            | DANFE        | NF-e       |
|  Nome Fantasia                       | Nr. XXX      | ENTRADA/   |
|  Logradouro, Nr - Complemento       | Serie XXX    | SAIDA      |
|  Bairro - CEP                        |              |            |
|  Municipio - UF                      | Pag X de Y   |            |
|  Fone: (XX) XXXX-XXXX               |              |            |
|  CNPJ: XX.XXX.XXX/XXXX-XX           |              |            |
|  IE: XXXXXXXXXXX                     |              |            |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo | Configuracao |
|-------------|----------------|--------------|
| Razao Social | Fiscal > Configuracoes > Razao Social | Emitente |
| Nome Fantasia | Fiscal > Configuracoes > Nome Fantasia | Emitente |
| CNPJ | Fiscal > Configuracoes > CNPJ | Emitente |
| IE | Fiscal > Configuracoes > Inscricao Estadual | Emitente |
| Endereco | Fiscal > Configuracoes > Endereco | Emitente |
| Numero NF-e | Atribuido automaticamente pela SEFAZ | — |
| Serie | Atribuida automaticamente | — |

### Bloco 2 — Natureza da Operacao

```
+------------------------------------------------------------------+
|  NATUREZA DA OPERACAO                                             |
|  Retorno e Cobranca de Beneficiamento                             |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo | Configuracao |
|-------------|----------------|--------------|
| Natureza da Operacao | NF-e Rascunho > Natureza (autocomplete) | Fiscal > Naturezas de Operacao |

### Bloco 3 — Chave de Acesso

```
+------------------------------------------------------------------+
|  CHAVE DE ACESSO                                                  |
|  3526 0312 3456 7800 0190 5500 1000 0001 2311 2345 6789           |
|  |||||||||||||||||||||||||||||||||||||||||||||||||||||||           |
|  Consulta de autenticidade: www.nfe.fazenda.gov.br                |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo |
|-------------|----------------|
| Chave de Acesso | Gerada pela SEFAZ apos autorizacao — exibida na lista de NF-e |
| Codigo de barras | Gerado automaticamente pelo Focus NFe |

### Bloco 4 — Destinatario

```
+------------------------------------------------------------------+
|  DESTINATARIO / REMETENTE                                         |
|  Nome: CLIENTE INDUSTRIA LTDA                                     |
|  CNPJ: XX.XXX.XXX/XXXX-XX    Data Emissao: DD/MM/AAAA           |
|  Logradouro, Nr - Bairro      Data Saida: DD/MM/AAAA             |
|  Municipio - UF - CEP         Hora Saida: HH:MM:SS               |
|  IE: XXXXXXXXXXX                                                  |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo | Configuracao |
|-------------|----------------|--------------|
| Nome | NF-e Rascunho > Destinatario (autocomplete) | Cadastros > Pessoas |
| CNPJ/CPF | Cadastro do cliente > doc_unico | Cadastros > Pessoas |
| Endereco | Cadastro do cliente > endereco | Cadastros > Pessoas > Enderecos |
| IE | Cadastro do cliente > inscr_estadual | Cadastros > Pessoas |

### Bloco 5 — Fatura / Duplicatas

```
+------------------------------------------------------------------+
|  FATURA / DUPLICATA                                               |
|  001 - 15/04/2026 - R$ 6.074,03                                  |
|  002 - 15/05/2026 - R$ 6.074,03                                  |
|  003 - 14/06/2026 - R$ 6.074,03                                  |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo | Configuracao |
|-------------|----------------|--------------|
| Numero | Gerado automaticamente (001, 002, 003...) | — |
| Vencimento | Data emissao + dias da condicao | Condicao de Pagamento |
| Valor | Total NF-e / numero de parcelas | Automatico |

### Bloco 6 — Calculo do Imposto

```
+------------------------------------------------------------------+
|  CALCULO DO IMPOSTO                                               |
|  BC ICMS        | VALOR ICMS    | BC ICMS ST   | VALOR ICMS ST   |
|  R$ 18.222,09   | R$ 3.280,00   | R$ 0,00      | R$ 0,00         |
|  VL TOTAL PROD  | VL FRETE      | VL SEGURO    | VL DESCONTO     |
|  R$ 18.222,09   | R$ 500,00     | R$ 0,00      | R$ 0,00         |
|  OUTRAS DESP    | VALOR IPI     | VL APROX TRIB| VL TOTAL NF     |
|  R$ 0,00        | R$ 911,10     | R$ 4.191,10  | R$ 19.633,19    |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo |
|-------------|----------------|
| BC ICMS | Soma das bases de ICMS dos itens (calculado pelo motor tributario) |
| Valor ICMS | Soma dos valores de ICMS dos itens |
| VL Total Produtos | Soma (quantidade x valor unitario) de todos os itens |
| VL Frete | NF-e Rascunho > Valor do Frete |
| VL Desconto | Soma dos descontos de todos os itens |
| Valor IPI | Soma dos valores de IPI dos itens (imposto "por fora") |
| VL Total NF | Total Produtos - Descontos + Frete + IPI |

### Bloco 7 — Transportador / Volumes

```
+------------------------------------------------------------------+
|  TRANSPORTADOR / VOLUMES TRANSPORTADOS                            |
|  Razao Social: TRANSPORTADORA XYZ LTDA                            |
|  Frete por conta: 0 - Emitente (CIF)                             |
|  CNPJ: XX.XXX.XXX/XXXX-XX   Placa:       UF:                     |
|  Endereco:                   Municipio:   IE:                     |
|  QTD: 10    ESPECIE: VOLUMES    PESO BRUTO: 250,00   PESO LIQ: 230,00
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo | Configuracao |
|-------------|----------------|--------------|
| Razao Social | NF-e > Transportadora (autocomplete) | Logistica > Transportadoras |
| Frete por conta | NF-e > Modalidade de Frete | 0=CIF, 1=FOB, 9=Sem |
| CNPJ | Cadastro da transportadora | Logistica > Transportadoras |
| Quantidade | NF-e > Qtd. Volumes | Auto-calculado ou manual |
| Especie | NF-e > Especie | VOLUMES, CAIXAS, etc. |
| Peso Bruto | NF-e > Peso Bruto | Auto-calculado dos produtos |
| Peso Liquido | NF-e > Peso Liquido | Auto-calculado dos produtos |

### Bloco 8 — Dados dos Produtos / Servicos

```
+------------------------------------------------------------------+
|  DADOS DOS PRODUTOS / SERVICOS                                    |
|  COD  | DESCRICAO         | NCM      | CST | CFOP | UN | QTD    |
|  001  | Flange Beneficiada| 73079900 | 00  | 5124 | UN | 500,00 |
|       |                   |          |     |      |    |        |
|  VL UNIT | VL TOTAL | BC ICMS    | VL ICMS  | VL IPI | AL ICMS|
|  36,44   | 18222,09 | 18222,09   | 3280,00  | 911,10 | 18,00  |
+------------------------------------------------------------------+
```

| Coluna DANFE | Campo no Revo | Origem |
|-------------|---------------|--------|
| COD | produto_id | Auto (codigo interno) |
| DESCRICAO | Produto (autocomplete) | Nome do produto |
| NCM | NCM | Cadastro do produto ou editar na NF-e |
| CST | CST / CSOSN | Natureza de operacao (auto) |
| CFOP | CFOP | Natureza de operacao + UF emitente vs destinatario (auto) |
| UN | Unidade | Cadastro do produto |
| QTD | Quantidade | Informado no faturamento ou editado na NF-e |
| VL UNIT | Valor Unitario | Preco de venda do produto ou informado no faturamento |
| VL TOTAL | QTD x VL UNIT | Calculado automaticamente |
| BC ICMS | Base de Calculo | Motor tributario (auto) |
| VL ICMS | Valor ICMS | Base x Aliquota (auto) |
| VL IPI | Valor IPI | Base x Aliquota IPI (auto) |
| AL ICMS | Aliquota ICMS | Natureza de operacao |

### Bloco 9 — Informacoes Adicionais

```
+------------------------------------------------------------------+
|  DADOS ADICIONAIS                                                 |
|  Informacoes Complementares:                                      |
|  Retorno de beneficiamento conforme NF-e 12345                    |
|  xPed: PED-2026-001 | nItemPed: 1                                |
+------------------------------------------------------------------+
```

| Campo DANFE | Origem no Revo |
|-------------|----------------|
| Informacoes Complementares | Natureza de Operacao > Observacoes Padrao |
| xPed (por item) | NF-e Item > Informacoes Adicionais (infAdProd) |
| nItemPed (por item) | Propagado do pedido de venda |

---

## 12. Troubleshooting — Problemas Comuns

### Erro: "DESTINATARIO_INCOMPLETO"

**Causa:** O cadastro do cliente esta faltando dados obrigatorios para a NF-e.

**Solucao:**
1. O erro lista exatamente quais campos faltam (ex: "CEP, Municipio")
2. Acesse **Cadastros > Pessoas**
3. Localize o cliente e edite
4. Preencha os campos faltantes
5. Volte a NF-e e tente enviar novamente

### Erro: "EMITENTE_NOT_CONFIGURED"

**Causa:** Os dados do emitente (sua empresa) nao estao preenchidos.

**Solucao:**
1. Acesse **Fiscal > Configuracoes**
2. Preencha todos os campos obrigatorios (CNPJ, Razao Social, IE, endereco)
3. Salve
4. Volte a NF-e e tente enviar novamente

### Erro: Rejeicao 539 — "Duplicidade de NF-e"

**Causa:** Uma NF-e com a mesma chave de acesso ja foi autorizada anteriormente.

**Solucao:**
1. Verifique se voce ja emitiu esta nota anteriormente
2. Se sim, descarte o rascunho duplicado
3. Se nao, entre em contato com o suporte

### Erro: Rejeicao 301 — "IE do destinatario nao cadastrada"

**Causa:** A Inscricao Estadual informada no cadastro do cliente nao confere com a base da SEFAZ.

**Solucao:**
1. Confirme a IE correta com o cliente
2. Atualize em **Cadastros > Pessoas > [Cliente] > Inscricao Estadual**
3. Reenvie a NF-e

### Erro: Rejeicao 225 — "Falha no Schema XML"

**Causa:** Algum campo obrigatorio esta com formato incorreto (ex: NCM com menos de 8 digitos).

**Solucao:**
1. Abra o rascunho da NF-e
2. Verifique NCM (8 digitos), CFOP (4 digitos), CST/CSOSN
3. Corrija os campos invalidos
4. Salve e reenvie

### Status "Processando" por mais de 10 minutos

**Causa:** A SEFAZ esta demorando para responder (comum em horarios de pico).

**Solucao:**
1. O badge mostra "STALE" quando ultrapassa 10 minutos
2. Clique em **"Consultar Status"** para forcar uma verificacao
3. Se persistir, aguarde — a SEFAZ pode estar em manutencao
4. O sistema continua fazendo polling automatico a cada 5 segundos

### NF-e Rejeitada — Como reenviar?

1. Abra a NF-e rejeitada (status vermelho)
2. Leia o motivo da rejeicao no card vermelho — ele mostra:
   - **Codigo** da rejeicao (ex: [539])
   - **Descricao** do problema
   - **Causa** detalhada
   - **Solucao sugerida** (icone de lampada)
3. Corrija o problema indicado
4. Clique em **"Reprocessar"** para enviar novamente

---

## 13. Checklist Rapido de Validacao

Use este checklist para validar o fluxo completo de ponta a ponta. Marque cada item conforme avanca:

### Configuracao (uma vez)

- [ ] Emitente fiscal configurado com CNPJ, IE, endereco completo
- [ ] Token Focus NFe configurado (Homologacao e/ou Producao)
- [ ] Natureza de operacao "RET_COBR" cadastrada (5124/6124)
- [ ] Pelo menos uma condicao de pagamento cadastrada
- [ ] Transportadora cadastrada (se aplicavel)
- [ ] Cliente de teste cadastrado com CNPJ, endereco completo, IE

### Fluxo completo (a cada operacao)

- [ ] **XML importado** — NF-e do fornecedor/cliente registrada
- [ ] **Estoque atualizado** — saldos refletem a entrada
- [ ] **Material classificado** — vinculado ao cliente dono
- [ ] **OB criada** — com produto, quantidade, cliente corretos
- [ ] **OB concluida** — status alterado para "Concluida"
- [ ] **OB faturada** — botao "Faturar" clicado, NF-e rascunho criada
- [ ] **NF-e revisada** — todos os campos conferidos:
  - [ ] Ambiente correto (Producao para nota real)
  - [ ] Natureza de operacao correta
  - [ ] Destinatario com endereco completo
  - [ ] NCM de todos os itens (8 digitos)
  - [ ] CFOP correto (5xxx dentro UF, 6xxx fora UF)
  - [ ] CST ou CSOSN preenchido
  - [ ] Impostos calculados (ICMS, PIS, COFINS)
  - [ ] Condicao de pagamento e duplicatas
  - [ ] Peso e volumes preenchidos
  - [ ] Informacoes adicionais por item (xPed, infAdProd) se necessario
- [ ] **NF-e enviada** — status "Processando"
- [ ] **NF-e autorizada** — status "Autorizada" (badge verde)
- [ ] **DANFE baixada** — PDF conferido visualmente
- [ ] **XML baixado** — arquivo XML salvo
- [ ] **Chave de acesso** — 44 digitos, consultavel no portal SEFAZ
- [ ] **Financeiro** — contas a receber criadas (se gera_financeiro = true)

### Teste de validacao rapida (Homologacao)

Para validar o fluxo sem gerar nota fiscal real:
1. Execute todos os passos acima com **Ambiente = Homologacao**
2. Use o cliente de teste
3. Confira que todos os status transitam corretamente
4. A nota sera autorizada em homologacao (sem valor fiscal)
5. Apos validar, repita com **Ambiente = Producao** para notas reais

---

**Fim do Manual**

> Duvidas? Consulte o Guia de Ajuda integrado no sistema (icone "?" no menu lateral) ou entre em contato com o suporte tecnico.
