/*
  NFE-02: Cadastro fiscal completo (empresa emitente)

  Objetivo:
  - Persistir dados fiscais do emitente (razão social, CNPJ/IE, endereço, regime/CRT).
  - Configurar numeração (série/próximo número) por empresa.
  - Preparar upload de certificado A1 em Storage (sem salvar segredo/senha no banco).

  Notas:
  - Emissão real via NFE.io será feita em NFE-05; aqui é apenas o cadastro base.
  - Bucket de certificado é privado; acesso limitado a admin/owner da empresa.
*/

BEGIN;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Emitente (por empresa)
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_nfe_emitente (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  razao_social text not null default '',
  nome_fantasia text null,
  cnpj text not null default '',
  ie text null,
  im text null,
  cnae text null,
  crt integer null, -- 1 Simples Nacional | 2 Simples excesso sublimite | 3 Regime Normal
  endereco_logradouro text null,
  endereco_numero text null,
  endereco_complemento text null,
  endereco_bairro text null,
  endereco_municipio text null,
  endereco_municipio_codigo text null, -- IBGE (7 dígitos)
  endereco_uf text null,
  endereco_cep text null,
  telefone text null,
  email text null,
  certificado_storage_path text null, -- ex.: {empresa_id}/a1_2026-01-01.pfx
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_emitente_crt_check check (crt is null or crt in (1,2,3))
);

alter table public.fiscal_nfe_emitente enable row level security;

drop trigger if exists tg_fiscal_nfe_emitente_updated_at on public.fiscal_nfe_emitente;
create trigger tg_fiscal_nfe_emitente_updated_at
before update on public.fiscal_nfe_emitente
for each row execute function public.tg_set_updated_at();

drop policy if exists fiscal_nfe_emitente_select on public.fiscal_nfe_emitente;
create policy fiscal_nfe_emitente_select
  on public.fiscal_nfe_emitente
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fiscal_nfe_emitente_admin_write on public.fiscal_nfe_emitente;
create policy fiscal_nfe_emitente_admin_write
  on public.fiscal_nfe_emitente
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

grant select on table public.fiscal_nfe_emitente to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_emitente to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Numeração NF-e (por empresa e série)
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_nfe_numeracao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  serie integer not null default 1,
  proximo_numero integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_numeracao_serie_check check (serie >= 1 and serie <= 999),
  constraint fiscal_nfe_numeracao_num_check check (proximo_numero >= 1 and proximo_numero <= 999999999),
  constraint fiscal_nfe_numeracao_unique unique (empresa_id, serie)
);

alter table public.fiscal_nfe_numeracao enable row level security;

drop trigger if exists tg_fiscal_nfe_numeracao_updated_at on public.fiscal_nfe_numeracao;
create trigger tg_fiscal_nfe_numeracao_updated_at
before update on public.fiscal_nfe_numeracao
for each row execute function public.tg_set_updated_at();

drop policy if exists fiscal_nfe_numeracao_select on public.fiscal_nfe_numeracao;
create policy fiscal_nfe_numeracao_select
  on public.fiscal_nfe_numeracao
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fiscal_nfe_numeracao_admin_write on public.fiscal_nfe_numeracao;
create policy fiscal_nfe_numeracao_admin_write
  on public.fiscal_nfe_numeracao
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

grant select on table public.fiscal_nfe_numeracao to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_numeracao to authenticated, service_role;

-- Seed default numeração (série 1) por empresa que ainda não possui
insert into public.fiscal_nfe_numeracao (empresa_id, serie, proximo_numero, ativo)
select e.id, 1, 1, true
from public.empresas e
where not exists (
  select 1 from public.fiscal_nfe_numeracao n where n.empresa_id = e.id and n.serie = 1
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3) Storage bucket para certificado A1 (privado)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('nfe_certificados', 'nfe_certificados', false)
on conflict (id) do nothing;

-- Policies storage.objects
-- Path: {empresa_id}/{filename}

drop policy if exists "NFE Cert: admin read" on storage.objects;
create policy "NFE Cert: admin read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nfe_certificados'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      left join public.roles r on r.id = eu.role_id
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
        and (
          upper(coalesce(r.slug, '')) in ('OWNER','ADMIN')
          or upper(coalesce(eu.role, '')) in ('OWNER','ADMIN')
        )
    )
  )
);

drop policy if exists "NFE Cert: admin upload" on storage.objects;
create policy "NFE Cert: admin upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nfe_certificados'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      left join public.roles r on r.id = eu.role_id
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
        and (
          upper(coalesce(r.slug, '')) in ('OWNER','ADMIN')
          or upper(coalesce(eu.role, '')) in ('OWNER','ADMIN')
        )
    )
  )
);

drop policy if exists "NFE Cert: admin update" on storage.objects;
create policy "NFE Cert: admin update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'nfe_certificados'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      left join public.roles r on r.id = eu.role_id
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
        and (
          upper(coalesce(r.slug, '')) in ('OWNER','ADMIN')
          or upper(coalesce(eu.role, '')) in ('OWNER','ADMIN')
        )
    )
  )
);

drop policy if exists "NFE Cert: admin delete" on storage.objects;
create policy "NFE Cert: admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nfe_certificados'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      left join public.roles r on r.id = eu.role_id
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
        and (
          upper(coalesce(r.slug, '')) in ('OWNER','ADMIN')
          or upper(coalesce(eu.role, '')) in ('OWNER','ADMIN')
        )
    )
  )
);

select pg_notify('pgrst', 'reload schema');

COMMIT;

