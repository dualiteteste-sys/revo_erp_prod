/*
# [Security Hardening] Enable RLS on RBAC catalog tables
- This migration enables Row Level Security on the `roles`, `permissions`, and `role_permissions` tables.
- It adds a permissive SELECT policy for all authenticated users, as this data is considered public within the application.
- It does NOT grant insert, update, or delete permissions, which should be handled by admin-level operations.
*/

-- Enable RLS for roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;

-- Allow authenticated users to read all roles
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.roles;
CREATE POLICY "Allow read access to all authenticated users"
ON public.roles
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS for permissions table
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;

-- Allow authenticated users to read all permissions
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.permissions;
CREATE POLICY "Allow read access to all authenticated users"
ON public.permissions
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS for role_permissions table
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;

-- Allow authenticated users to read all role-permission links
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.role_permissions;
CREATE POLICY "Allow read access to all authenticated users"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

-- Reload schema for PostgREST to pick up changes
SELECT pg_notify('pgrst', 'reload schema');
