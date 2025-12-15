-- Garante que o view de compatibilidade `public.industria_roteiro_etapas`
-- fique idêntico ao esperado no VERIFY (md5 estável), mesmo que a tabela
-- base tenha colunas extras.

begin;

-- Recria o view com lista de colunas explícita na ordem canônica.
drop view if exists public.industria_roteiro_etapas;
create view public.industria_roteiro_etapas as
select
  id,
  empresa_id,
  roteiro_id,
  sequencia,
  nome,
  centro_trabalho_id,
  descricao,
  tempo_setup,
  tempo_operacao,
  created_at,
  updated_at
from public.industria_roteiros_etapas;

comment on view public.industria_roteiro_etapas
  is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas (colunas canônicas).';

commit;

