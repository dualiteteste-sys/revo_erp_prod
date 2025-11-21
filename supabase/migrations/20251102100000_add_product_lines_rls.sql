/*
# [RLS] Secure `linhas_produto` table

## Query Description:
This migration enables Row Level Security (RLS) on the `public.linhas_produto` table and applies policies to ensure that users can only interact with product lines belonging to companies they are members of. This aligns the table's security with the multi-tenant architecture of the application.

- SELECT: Users can only see product lines from their active company.
- INSERT: Users can only add product lines to a company they are a member of.
- UPDATE: Users can only modify product lines from a company they are a member of.
- DELETE: Users can only delete product lines from a company they are a member of.

This operation is safe and does not risk data loss. It is a critical security enhancement.

## Metadata:
- Schema-Category: "Security"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (by disabling RLS and dropping policies)

## Structure Details:
- Table: `public.linhas_produto`
- Columns: `empresa_id` (used for policy check)

## Security Implications:
- RLS Status: Enabled
- Policy Changes: Yes (4 new policies added)
- Auth Requirements: User must be authenticated and a member of the target company.

## Performance Impact:
- Indexes: None
- Triggers: None
- Estimated Impact: Negligible. The check relies on the `is_user_member_of` function which should be efficient.
*/

-- 1. Enable RLS
alter table public.linhas_produto enable row level security;

-- 2. Drop existing policies (if any) to ensure a clean slate
drop policy if exists "Allow ALL for members" on public.linhas_produto;
drop policy if exists "Allow SELECT for members" on public.linhas_produto;
drop policy if exists "Allow INSERT for members" on public.linhas_produto;
drop policy if exists "Allow UPDATE for members" on public.linhas_produto;
drop policy if exists "Allow DELETE for members" on public.linhas_produto;


-- 3. Create policies
create policy "Allow SELECT for members"
  on public.linhas_produto for select
  using ( is_user_member_of(empresa_id) );

create policy "Allow INSERT for members"
  on public.linhas_produto for insert
  with check ( is_user_member_of(empresa_id) );

create policy "Allow UPDATE for members"
  on public.linhas_produto for update
  using ( is_user_member_of(empresa_id) );

create policy "Allow DELETE for members"
  on public.linhas_produto for delete
  using ( is_user_member_of(empresa_id) );
