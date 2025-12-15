-- Documentos/instruções versionadas por operação
begin;

create table if not exists public.industria_operacao_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  operacao_id uuid not null references public.industria_producao_operacoes(id) on delete cascade,
  titulo text not null,
  descricao text,
  arquivo_path text not null,
  mime_type text,
  tamanho_bytes bigint,
  versao integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default public.current_user_id()
);

create index if not exists idx_ind_op_docs_empresa_operacao on public.industria_operacao_documentos(empresa_id, operacao_id);
create index if not exists idx_ind_op_docs_operacao_titulo_versao on public.industria_operacao_documentos(operacao_id, titulo, versao desc);

alter table public.industria_operacao_documentos enable row level security;

drop policy if exists "ind_op_docs_select" on public.industria_operacao_documentos;
create policy "ind_op_docs_select" on public.industria_operacao_documentos
  for select using (empresa_id = public.current_empresa_id());

drop policy if exists "ind_op_docs_insert" on public.industria_operacao_documentos;
create policy "ind_op_docs_insert" on public.industria_operacao_documentos
  for insert with check (empresa_id = public.current_empresa_id());

drop policy if exists "ind_op_docs_update" on public.industria_operacao_documentos;
create policy "ind_op_docs_update" on public.industria_operacao_documentos
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "ind_op_docs_delete" on public.industria_operacao_documentos;
create policy "ind_op_docs_delete" on public.industria_operacao_documentos
  for delete using (empresa_id = public.current_empresa_id());

-- RPC: registra novo documento e incrementa versão automaticamente por (operacao,titulo)
drop function if exists public.industria_operacao_doc_register(uuid, text, text, text, bigint);
create or replace function public.industria_operacao_doc_register(
  p_operacao_id uuid,
  p_titulo text,
  p_descricao text,
  p_arquivo_path text,
  p_tamanho_bytes bigint default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_next int;
  v_id uuid;
begin
  if v_emp is null then
    raise exception 'Empresa não definida.';
  end if;
  if p_operacao_id is null then
    raise exception 'Operação é obrigatória.';
  end if;
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'Título é obrigatório.';
  end if;
  if p_arquivo_path is null or btrim(p_arquivo_path) = '' then
    raise exception 'Arquivo é obrigatório.';
  end if;

  select coalesce(max(d.versao), 0) + 1
    into v_next
  from public.industria_operacao_documentos d
  where d.empresa_id = v_emp
    and d.operacao_id = p_operacao_id
    and lower(d.titulo) = lower(p_titulo);

  insert into public.industria_operacao_documentos (
    empresa_id, operacao_id, titulo, descricao, arquivo_path, tamanho_bytes, versao, ativo
  ) values (
    v_emp, p_operacao_id, btrim(p_titulo), nullif(btrim(p_descricao),''), p_arquivo_path, p_tamanho_bytes, v_next, true
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- RPC: lista documentos (latest por título por padrão)
drop function if exists public.industria_operacao_docs_list(uuid, boolean);
create or replace function public.industria_operacao_docs_list(
  p_operacao_id uuid,
  p_only_latest boolean default true
) returns table (
  id uuid,
  operacao_id uuid,
  titulo text,
  descricao text,
  arquivo_path text,
  tamanho_bytes bigint,
  versao int,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with docs as (
    select d.*
      from public.industria_operacao_documentos d
     where d.empresa_id = public.current_empresa_id()
       and d.operacao_id = p_operacao_id
  ),
  ranked as (
    select d.*,
           row_number() over (partition by lower(d.titulo) order by d.versao desc, d.created_at desc) as rn
      from docs d
  )
  select r.id, r.operacao_id, r.titulo, r.descricao, r.arquivo_path, r.tamanho_bytes, r.versao, r.created_at
    from ranked r
   where (p_only_latest is false) or r.rn = 1
   order by r.titulo asc, r.versao desc, r.created_at desc;
$$;

revoke all on function public.industria_operacao_doc_register(uuid, text, text, text, bigint) from public;
grant execute on function public.industria_operacao_doc_register(uuid, text, text, text, bigint) to authenticated, service_role;

revoke all on function public.industria_operacao_docs_list(uuid, boolean) from public;
grant execute on function public.industria_operacao_docs_list(uuid, boolean) to authenticated, service_role;

commit;

