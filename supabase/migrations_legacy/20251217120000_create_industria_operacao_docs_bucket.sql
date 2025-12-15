-- Bucket privado para documentos/instruções de trabalho por operação
-- Path convention: {empresa_id}/{operacao_id}/{filename}

insert into storage.buckets (id, name, public)
values ('industria_operacao_docs', 'industria_operacao_docs', false)
on conflict (id) do nothing;

-- SELECT: somente usuários autenticados membros da empresa no path
drop policy if exists "Read Industria Operacao Docs" on storage.objects;
create policy "Read Industria Operacao Docs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

-- INSERT/UPDATE/DELETE: somente membros da empresa no path
drop policy if exists "Write Industria Operacao Docs" on storage.objects;
create policy "Write Industria Operacao Docs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

drop policy if exists "Update Industria Operacao Docs" on storage.objects;
create policy "Update Industria Operacao Docs"
on storage.objects for update
to authenticated
using (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

drop policy if exists "Delete Industria Operacao Docs" on storage.objects;
create policy "Delete Industria Operacao Docs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'industria_operacao_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
    )
  )
);

