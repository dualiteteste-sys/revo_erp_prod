-- Migration: Configura o armazenamento para logos de empresas
-- Cria o bucket 'company_logos' e aplica políticas de segurança (RLS).

-- 1. Cria o bucket de armazenamento se ele não existir.
--    - `public: true` permite acesso público via URL.
--    - `file_size_limit`: 5MB.
--    - `allowed_mime_types`: Apenas imagens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company_logos', 'company_logos', true, 5242880, '{"image/jpeg","image/png","image/webp","image/gif"}')
on conflict (id) do nothing;

-- 2. Políticas de Segurança (RLS) para o bucket 'company_logos'.
-- Garante que as políticas antigas (se existirem) sejam removidas para evitar conflitos.
drop policy if exists "Public read access for company logos" on storage.objects;
drop policy if exists "Allow insert for authenticated users in their company folder" on storage.objects;
drop policy if exists "Allow update for authenticated users in their company folder" on storage.objects;
drop policy if exists "Allow delete for authenticated users in their company folder" on storage.objects;

-- Permite que qualquer pessoa (incluindo usuários não autenticados) leia os logos.
-- Essencial para exibir os logos em locais públicos ou e-mails.
create policy "Public read access for company logos"
on storage.objects for select
using ( bucket_id = 'company_logos' );

-- Permite que um usuário autenticado envie um logo, desde que o caminho do arquivo
-- comece com o ID da empresa da qual ele é membro.
-- Ex: `empresa_id/logo.png`
create policy "Allow insert for authenticated users in their company folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company_logos'
  and auth.uid() is not null
  and public.is_user_member_of((storage.foldername(name))[1]::uuid)
);

-- Permite que um usuário autenticado atualize (substitua) um logo
-- na pasta da sua própria empresa.
create policy "Allow update for authenticated users in their company folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'company_logos'
  and auth.uid() is not null
  and public.is_user_member_of((storage.foldername(name))[1]::uuid)
);

-- Permite que um usuário autenticado exclua um logo
-- da pasta da sua própria empresa.
create policy "Allow delete for authenticated users in their company folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'company_logos'
  and auth.uid() is not null
  and public.is_user_member_of((storage.foldername(name))[1]::uuid)
);
