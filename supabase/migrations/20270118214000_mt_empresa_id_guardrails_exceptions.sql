/*
  MT guardrails — exceções (catálogos globais)

  Algumas tabelas intencionalmente permitem registros com empresa_id NULL para
  "defaults do sistema" compartilhados (ex.: unidades e embalagens).

  Essas tabelas NÃO devem receber o guardrail `CHECK (empresa_id is not null)`.
*/

begin;

-- Catálogos globais (defaults do sistema)
alter table if exists public.unidades_medida
  drop constraint if exists ck_unidades_medida_empresa_id_nn;

alter table if exists public.embalagens
  drop constraint if exists ck_embalagens_empresa_id_nn;

commit;

