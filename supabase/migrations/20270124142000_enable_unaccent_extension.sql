-- Required by pricing slug helpers (state-of-the-art search/slugs).
-- Some environments (e.g. local Supabase CLI) don't have it enabled by default.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

