This folder keeps historical SQL files that **must not** be executed in dev or production.

- The real source of truth for the database is `supabase/migrations/`.
- Files here were left only for reference and may conflict with the current schema.
- When some logic is still required, promote it to an official migration and remove the legacy copy (as done for the Recebimento module).

✔️ TL;DR: never run anything from `migrations_legacy` during deploys.
