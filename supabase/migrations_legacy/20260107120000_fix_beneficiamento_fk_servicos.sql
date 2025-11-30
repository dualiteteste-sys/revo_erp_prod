-- fix_benef_ordens_fk_servicos.sql
-- Alinha FK de industria_benef_ordens para public.servicos e cria serviços faltantes a partir de produtos

-- 0) Segurança de execução
set local search_path = pg_catalog, public;

-- 1) Inserir serviços faltantes com o MESMO UUID das ordens (derivado de produtos)
with faltantes as (
  select distinct o.produto_servico_id as id
  from public.industria_benef_ordens o
  left join public.servicos s on s.id = o.produto_servico_id
  where o.produto_servico_id is not null
    and s.id is null
),
src as (
  select
    p.id,
    coalesce(nullif(p.nome, ''), 'Serviço sem descrição')          as descricao,
    coalesce(nullif(p.unidade, ''), 'UN')                           as unidade,
    nullif(p.preco_venda, 0)::numeric                              as preco_venda
  from faltantes f
  join public.produtos p on p.id = f.id
)
insert into public.servicos (
  id, descricao, unidade, preco_venda, status,
  codigo, codigo_servico, nbs, nbs_ibpt_required,
  descricao_complementar, observacoes, created_at, updated_at
)
select
  s.id,
  s.descricao,
  s.unidade,
  s.preco_venda,
  'ativo',
  null, null, null, false,
  null,
  'Criado automaticamente a partir de produtos para atender beneficiamento',
  now(), now()
from src s
on conflict (id) do nothing;

-- 2) Remover FK incorreto (para produtos) se existir
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'ind_benef_ordens_prod_serv_fkey'
      and conrelid = 'public.industria_benef_ordens'::regclass
  ) then
    alter table public.industria_benef_ordens
      drop constraint ind_benef_ordens_prod_serv_fkey;
  end if;
end$$;

-- 3) Criar FK correto para servicos(id) se ainda não existir
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ind_benef_ordens_servico_fkey'
      and conrelid = 'public.industria_benef_ordens'::regclass
  ) then
    alter table public.industria_benef_ordens
      add constraint ind_benef_ordens_servico_fkey
      foreign key (produto_servico_id) references public.servicos(id);
  end if;
end$$;

-- 4) Forçar reload do cache do PostgREST para expor o FK atualizado em /rpc
notify pgrst, 'reload schema';
