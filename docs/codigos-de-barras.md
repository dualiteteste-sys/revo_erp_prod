# Códigos de barras — Ultria ERP

## Conceitos

### 1) Código de barras interno (recomendado)
- **Uso:** estoque / PDV / leitura interna.
- **Tipo:** `Code 128` (flexível, fácil de gerar e ler).
- **Geração:** o sistema pode gerar em **1 clique** (sempre único por empresa).

### 2) GTIN / EAN “oficial” (marketplaces)
- **Uso:** marketplaces e integrações que exigem um código oficial.
- **Regra:** o cliente deve informar o GTIN/EAN. O sistema **não gera GTIN/EAN oficial** sem prefixo próprio parametrizado.
- No cadastro de produto, existe o campo **GTIN / EAN** para esse fim.

## Como funciona com variações

- O **produto pai** pode ter um código.
- Cada **variação** pode:
  - **herdar** o código do pai (padrão), ou
  - definir um **código próprio** (override).

## Segurança e unicidade (multi-tenant)

- Os códigos são armazenados em `public.produtos_codigos_barras`.
- Unicidade é garantida por índice **(empresa_id, barcode_value)**.
- Operações são via RPC (RPC-first) com validação de permissão e `empresa_id` sempre filtrado por `current_empresa_id()`.

