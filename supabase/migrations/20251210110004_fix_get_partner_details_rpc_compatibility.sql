/*
# [RPC][PARCEIROS] Fix get_partner_details compatibility
This migration fixes a compatibility issue with the `get_partner_details` function by removing the `json_strip_nulls` call, which is not available on all PostgreSQL versions.

## Query Description: [This operation replaces a database function to ensure compatibility. It is a safe, non-destructive change that only affects how partner details are retrieved.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Function `public.get_partner_details(uuid)` will be replaced.

## Security Implications:
- RLS Status: [Enabled]
- Policy Changes: [No]
- Auth Requirements: [Authenticated users]

## Performance Impact:
- Indexes: [Not Affected]
- Triggers: [Not Affected]
- Estimated Impact: [Negligible performance impact.]
*/

-- [RPC][PARCEIROS] Recria a função get_partner_details para ser compatível com versões mais antigas do PostgreSQL.
drop function if exists public.get_partner_details(uuid);
create or replace function public.get_partner_details(p_id uuid)
returns json
language sql
security definer
set search_path = pg_catalog, public
as $$
  select to_jsonb(p) ||
         jsonb_build_object('enderecos', coalesce(
           (select jsonb_agg(to_jsonb(e) - 'pessoa_id') from public.pessoa_enderecos e where e.pessoa_id = p.id),
           '[]'::jsonb
         )) ||
         jsonb_build_object('contatos', coalesce(
           (select jsonb_agg(to_jsonb(c) - 'pessoa_id') from public.pessoa_contatos c where c.pessoa_id = p.id),
           '[]'::jsonb
         ))
  from public.pessoas p
  where p.id = p_id and public.is_user_member_of(p.empresa_id);
$$;

revoke execute on function public.get_partner_details(uuid) from public;
grant  execute on function public.get_partner_details(uuid) to authenticated;
