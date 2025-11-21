/*
  ## Query Description
  Corrige a função `_seed_services_for_empresa` que causava o erro "query has no destination for result data".
  A cláusula `RETURNING *` do `INSERT` foi removida, pois seu resultado não era utilizado, e a função já retorna os dados semeados com um `SELECT` ao final.

  ## Metadata
  - Schema-Category: ["Structural"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [false] (a versão anterior estava quebrada)

  ## Security Implications
  - Nenhuma. Apenas corrige um bug funcional. As permissões e a lógica de segurança permanecem as mesmas.

  ## Performance Impact
  - Mínimo. A remoção da cláusula `RETURNING *` pode marginalmente melhorar a performance da inserção.
*/

-- Helper interno: realiza upsert para um empresa_id informado
create or replace function public._seed_services_for_empresa(p_empresa_id uuid)
returns setof public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_empresa_id is null then
    raise exception '[SEED][SERVICOS] empresa_id nulo' using errcode='22004';
  end if;

  -- Lista de serviços (codigo, descricao, preco, unidade, status, codigo_servico, nbs, nbs_ibpt_required)
  with payload(codigo, descricao, preco, unidade, status, codigo_servico, nbs, nbs_ibpt_required) as (
    values
      ('SVC-001','Instalação de Equipamento',            200.00,'UN','ativo','1099','1.09.01',false),
      ('SVC-002','Manutenção Preventiva',                 150.00,'UN','ativo','1099','1.09.01',false),
      ('SVC-003','Configuração de Sistema',               180.00,'UN','ativo','1099','1.09.01',false),
      ('SVC-004','Treinamento Operacional',               250.00,'H', 'ativo','1099','1.09.01',false),
      ('SVC-005','Consultoria Técnica',                   300.00,'H', 'ativo','1099','1.09.01',false),
      ('SVC-006','Visita Técnica',                        120.00,'UN','ativo','1099','1.09.01',false),
      ('SVC-007','Suporte Remoto',                         90.00,'H', 'ativo','1099','1.09.01',false),
      ('SVC-008','Calibração',                            220.00,'UN','ativo','1099','1.09.01',false),
      ('SVC-009','Laudo Técnico',                         280.00,'UN','ativo','1099','1.09.01',false),
      ('SVC-010','Customização de Relatórios',            350.00,'UN','ativo','1099','1.09.01',false)
  )
  insert into public.servicos (
    empresa_id, descricao, codigo, preco_venda, unidade, status,
    codigo_servico, nbs, nbs_ibpt_required, descricao_complementar, observacoes
  )
  select
    p_empresa_id,
    p.descricao,
    p.codigo,
    p.preco,
    p.unidade,
    p.status::public.status_servico,
    p.codigo_servico,
    p.nbs,
    p.nbs_ibpt_required,
    null, null
  from payload p
  on conflict (empresa_id, codigo) where codigo is not null
  do update set
    descricao        = excluded.descricao,
    preco_venda      = excluded.preco_venda,
    unidade          = excluded.unidade,
    status           = excluded.status,
    codigo_servico   = excluded.codigo_servico,
    nbs              = excluded.nbs,
    nbs_ibpt_required= excluded.nbs_ibpt_required,
    updated_at       = now();

  return query
    select s.*
    from public.servicos s
    where s.empresa_id = p_empresa_id
      and s.codigo in ('SVC-001','SVC-002','SVC-003','SVC-004','SVC-005','SVC-006','SVC-007','SVC-008','SVC-009','SVC-010')
    order by s.codigo;
end;
$$;
