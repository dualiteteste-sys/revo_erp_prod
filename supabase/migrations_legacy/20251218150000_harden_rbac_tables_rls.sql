/*
          # [Operation Name]
          Harden RBAC Tables RLS
          ## Query Description: [This migration addresses security advisories by enabling Row Level Security (RLS) on the core RBAC tables (`roles`, `permissions`, `role_permissions`). It applies a safe default policy that allows authenticated users to read these tables, which is necessary for the frontend to understand permissions. Modifications (INSERT, UPDATE, DELETE) to these tables are intended to be handled exclusively through secure, `SECURITY DEFINER` RPC functions, thus no policies for these actions are created here.]
          ## Metadata:
          - Schema-Category: ["Structural", "Safe"]
          - Impact-Level: ["Low"]
          - Requires-Backup: [false]
          - Reversible: [true]
          ## Structure Details:
          - Tables Affected: `public.roles`, `public.permissions`, `public.role_permissions`
          - Policies Added: SELECT policies for authenticated users on the affected tables.
          ## Security Implications:
          - RLS Status: [Enabled]
          - Policy Changes: [Yes]
          - Auth Requirements: [User must be authenticated to read these tables.]
          ## Performance Impact:
          - Indexes: [No changes.]
          - Triggers: [No changes.]
          - Estimated Impact: [Low. Adds a security check on read operations for these tables.]
          */

-- Enable RLS and add read-only policies for RBAC tables

-- 1) Table: roles
alter table public.roles enable row level security;
alter table public.roles force row level security;

drop policy if exists "Allow read access to authenticated users" on public.roles;
create policy "Allow read access to authenticated users"
on public.roles
for select to authenticated
using (true);

-- 2) Table: permissions
alter table public.permissions enable row level security;
alter table public.permissions force row level security;

drop policy if exists "Allow read access to authenticated users" on public.permissions;
create policy "Allow read access to authenticated users"
on public.permissions
for select to authenticated
using (true);

-- 3) Table: role_permissions
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;

drop policy if exists "Allow read access to authenticated users" on public.role_permissions;
create policy "Allow read access to authenticated users"
on public.role_permissions
for select to authenticated
using (true);

-- 4) Sinalizar PostgREST
select pg_notify('pgrst','reload schema');
