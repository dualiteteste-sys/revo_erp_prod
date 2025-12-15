-- Hotfix: garante existência do view de compatibilidade usado por RPCs legadas.
-- Motivo: o PROD pode ter aplicado versões anteriores do backfill sem o view.

begin;

create or replace view public.industria_roteiro_etapas as
select *
  from public.industria_roteiros_etapas;

comment on view public.industria_roteiro_etapas
  is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';

commit;

