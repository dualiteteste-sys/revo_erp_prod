-- Force PostgREST schema cache reload to recognize new functions
-- This fixes the "Could not find the function..." error after creating new RPCs
NOTIFY pgrst, 'reload schema';
