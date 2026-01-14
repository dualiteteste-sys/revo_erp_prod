/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_FUNCTIONS_URL: string;
  readonly VITE_LOCAL_BILLING_BYPASS?: string;
  readonly VITE_LOCAL_PLAN_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
