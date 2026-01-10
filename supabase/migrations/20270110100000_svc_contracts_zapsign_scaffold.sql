/*
  SVC-CONTRATOS: Scaffold para assinatura via ZapSign (integração futura)

  Objetivo:
  - Preparar o schema para integrar com ZapSign sem quebrar o fluxo atual de "aceite simples"
  - Nenhuma chamada externa é feita aqui (integração entra em etapa posterior)
*/

begin;

alter table public.servicos_contratos_documentos
  add column if not exists sign_provider text null,
  add column if not exists sign_external_id text null,
  add column if not exists sign_status text null,
  add column if not exists sign_url text null,
  add column if not exists signed_at timestamptz null,
  add column if not exists sign_payload jsonb null;

create index if not exists idx_svc_contract_docs_sign_external
  on public.servicos_contratos_documentos (sign_provider, sign_external_id);

commit;

