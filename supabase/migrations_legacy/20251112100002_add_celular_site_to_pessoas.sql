-- [DDL][PARTNERS] Adiciona celular e site na tabela de pessoas
/*
# [Operation Name]
Adicionar campos 'celular' e 'site' à tabela 'pessoas'.

## Query Description: [This operation adds two new text fields, `celular` and `site`, to the `public.pessoas` table. These fields are nullable and will not impact existing data. They are intended to store contact information for partners.]

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Table: public.pessoas
- Columns Added:
  - celular (TEXT, NULL)
  - site (TEXT, NULL)

## Security Implications:
- RLS Status: Unchanged
- Policy Changes: No
- Auth Requirements: None for this DDL. Access to new columns will be governed by existing RLS policies on `public.pessoas`.

## Performance Impact:
- Indexes: None added.
- Triggers: None added.
- Estimated Impact: Negligible.
*/
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS celular TEXT NULL;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS site TEXT NULL;
