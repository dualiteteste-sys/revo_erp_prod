import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logger } from "@/lib/logger";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lrfwiaekipwkjkzvcnfd.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZndpYWVraXB3a2prenZjbmZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4OTQwNzEsImV4cCI6MjA3NjQ3MDA3MX0.BnDwDZpWV62D_kPJb6ZtOzeRxgTPSQncqja332rxCYk";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL or Anon Key are missing from environment variables. Check your .env file."
  );
}

// Log controlado para debug de ambiente (URL + prefixo da anon key).
// NÃO muda comportamento, só ajuda a garantir que o projeto certo está sendo usado.
logger.info("[SUPABASE][CLIENT_INIT]", {
  supabaseUrl,
  anonKeyPrefix: supabaseAnonKey.slice(0, 8),
});

/**
 * IMPORTANTE:
 * - Não defina functions.url manualmente.
 * - O SDK usa o mesmo host de `supabaseUrl` para /functions/v1.
 * - Isso garante que o JWT e as Edge Functions pertençam ao MESMO projeto.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch,
  },
  // NADA de `functions: { url: ... }` aqui.
});
