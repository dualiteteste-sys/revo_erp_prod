/*
  SVC-CONTRATOS: Itens/Escopo do contrato (estado da arte - modelagem)

  Objetivo:
  - Registrar itens do escopo do contrato (informativo e auditável)
  - Preparar UX (somatório recorrente) sem acoplar diretamente ao billing
*/

begin;

create table if not exists public.servicos_contratos_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  contrato_id uuid not null references public.servicos_contratos(id) on delete cascade,

  pos int not null default 1 check (pos >= 1),
  titulo text not null,
  descricao text null,
  quantidade numeric(12,2) not null default 1 check (quantidade >= 0),
  unidade text null,
  valor_unitario numeric(15,2) not null default 0 check (valor_unitario >= 0),
  recorrente boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_servicos_contratos_itens_contrato_pos
  on public.servicos_contratos_itens (contrato_id, pos asc, created_at asc);

create index if not exists idx_servicos_contratos_itens_empresa
  on public.servicos_contratos_itens (empresa_id);

alter table public.servicos_contratos_itens enable row level security;
alter table public.servicos_contratos_itens force row level security;

drop policy if exists servicos_contratos_itens_all_company_members on public.servicos_contratos_itens;
create policy servicos_contratos_itens_all_company_members
on public.servicos_contratos_itens
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_contratos_itens_updated on public.servicos_contratos_itens;
create trigger tg_servicos_contratos_itens_updated
  before update on public.servicos_contratos_itens
  for each row execute function public.tg_set_updated_at();

grant all on table public.servicos_contratos_itens to authenticated, service_role;

commit;

