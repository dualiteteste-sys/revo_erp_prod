-- Seed: 10 serviços padrão
/*
  ## Query Description
  Adiciona duas RPCs de seed:
  - seed_services_for_current_user(): insere 10 serviços na empresa do usuário atual (JWT).
  - seed_services_for_empresa(p_empresa_id): variante admin para rodar no SQL editor (service_role).

  Idempotente: usa UPSERT por (empresa_id, codigo).

  ## Metadata
  - Schema-Category: ["Data", "Security"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true] (basta deletar os 10 códigos SVC-001..010 por empresa)

  ## Structure Details
  - Usa tabela existente public.servicos (unique idx por empresa_id+codigo quando não nulo)
  - Insere 10 linhas com códigos SVC-001..SVC-010 e preços/unidades padrão

  ## Security Implications
  - RLS permanece ativo.
  - RPCs são SECURITY DEFINER com search_path fixo.
  - Versão admin só é executável por service_role.

  ## Performance Impact
  - Inserção pequena (10 linhas). Sem impacto de performance.
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
    updated_at       = now()
  returning *;

  return query
    select s.*
    from public.servicos s
    where s.empresa_id = p_empresa_id
      and s.codigo in ('SVC-001','SVC-002','SVC-003','SVC-004','SVC-005','SVC-006','SVC-007','SVC-008','SVC-009','SVC-010')
    order by s.codigo;
end;
$$;

revoke all on function public._seed_services_for_empresa(uuid) from public;
-- Apenas papéis internos (chamada indireta); não expor a authenticated
grant execute on function public._seed_services_for_empresa(uuid) to service_role;

-- Versão ADMIN: seed por empresa_id (utilizar no SQL editor, sem JWT)
create or replace function public.seed_services_for_empresa(p_empresa_id uuid)
returns setof public.servicos
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select * from public._seed_services_for_empresa(p_empresa_id)
$$;

revoke all on function public.seed_services_for_empresa(uuid) from public;
grant execute on function public.seed_services_for_empresa(uuid) to service_role;

-- Versão USER: seed na empresa do usuário atual (JWT necessário)
create or replace function public.seed_services_for_current_user()
returns setof public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[SEED][SERVICOS] empresa_id inválido para a sessão' using errcode='42501';
  end if;

  return query select * from public._seed_services_for_empresa(v_emp);
end;
$$;

revoke all on function public.seed_services_for_current_user() from public;
grant execute on function public.seed_services_for_current_user() to authenticated;
grant execute on function public.seed_services_for_current_user() to service_role;
