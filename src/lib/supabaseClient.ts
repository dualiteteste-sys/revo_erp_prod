import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logger } from "@/lib/logger";
import { newRequestId } from "@/lib/requestId";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lrfwiaekipwkjkzvcnfd.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZndpYWVraXB3a2prenZjbmZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4OTQwNzEsImV4cCI6MjA3NjQ3MDA3MX0.BnDwDZpWV62D_kPJb6ZtOzeRxgTPSQncqja332rxCYk";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL or Anon Key are missing from environment variables. Check your .env file."
  );
}



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
    fetch: async (input, init) => {
      const requestId = newRequestId();
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isRpc = /\/rest\/v1\/rpc\//.test(url);
      const isEdgeFn = /\/functions\/v1\//.test(url);
      const timeoutMs = method === "GET" || method === "HEAD"
        ? 30000
        : isRpc || isEdgeFn
          ? 60000
          : 45000;

      try {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has("x-revo-request-id")) headers.set("x-revo-request-id", requestId);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const originalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        if (originalSignal) {
          if (originalSignal.aborted) controller.abort();
          else originalSignal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        try {
          return await fetch(input as any, { ...(init ?? {}), headers, signal: controller.signal });
        } catch (e) {
          if ((e as any)?.name === "AbortError") {
            logger.warn("[HTTP][TIMEOUT]", { method, url, timeoutMs, requestId });
          }
          throw e;
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        return fetch(input as any, init as any);
      }
    },
  },
  // NADA de `functions: { url: ... }` aqui.
});
