import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logger } from "@/lib/logger";
import { newRequestId } from "@/lib/requestId";
import { recordNetworkError } from "@/lib/telemetry/networkErrors";
import { getLastUserAction } from "@/lib/telemetry/lastUserAction";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lrfwiaekipwkjkzvcnfd.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZndpYWVraXB3a2prenZjbmZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4OTQwNzEsImV4cCI6MjA3NjQ3MDA3MX0.BnDwDZpWV62D_kPJb6ZtOzeRxgTPSQncqja332rxCYk";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL or Anon Key are missing from environment variables. Check your .env file."
  );
}

const rawFetch = globalThis.fetch.bind(globalThis);
const ops403Dedupe = new Map<string, number>();
const OPS403_DEDUPE_MS = 10_000;
const opsAppErrorsDedupe = new Map<string, number>();
const OPS_APP_ERRORS_DEDUPE_MS = 10_000;

function classifyOps403(code: string | null, message: string): string {
  const msg = String(message || "").toLowerCase();
  if (code === "42501" && (msg.includes("nenhuma empresa ativa") || msg.includes("sessão sem empresa"))) return "missing_active_empresa";
  if (msg.includes("recurso indisponível no plano") || msg.includes("faça upgrade") || msg.includes("plano atual")) return "plan_gating";
  if (code === "42501") return "permission";
  return "unknown";
}

async function logOps403FetchBestEffort(input: {
  requestId: string;
  url: string;
  route: string | null;
  rpcFn: string;
  code: string | null;
  message: string;
  details: string | null;
  recoveryAttempted?: boolean;
  recoveryOk?: boolean;
  headers: Headers;
}) {
  try {
    const now = Date.now();
    const key = `${input.rpcFn}|${input.route ?? ""}|${input.code ?? ""}|${input.message}`;
    const last = ops403Dedupe.get(key) ?? 0;
    if (now - last < OPS403_DEDUPE_MS) return;
    ops403Dedupe.set(key, now);

    const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/ops_403_events_log_v2`;
    const body = {
      p_rpc_fn: input.rpcFn,
      p_route: input.route ?? "",
      p_request_id: input.requestId,
      p_code: input.code ?? "",
      p_message: input.message,
      p_details: input.details ?? "",
      p_kind: classifyOps403(input.code, input.message),
      p_recovery_attempted: Boolean(input.recoveryAttempted),
      p_recovery_ok: Boolean(input.recoveryOk),
    };

    const headers = new Headers(input.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("x-revo-request-id", input.requestId);

    await rawFetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    // best-effort
  }
}

async function logOpsAppErrorFetchBestEffort(input: {
  requestId: string;
  url: string;
  route: string | null;
  lastAction: string | null;
  source: string;
  method: string;
  status: number;
  code: string | null;
  message: string;
  responseText: string | null;
  headers: Headers;
}) {
  try {
    const now = Date.now();
    const key = `${input.source}|${input.method}|${input.status}|${input.code ?? ""}|${input.route ?? ""}|${input.url.split("?")[0]}|${input.message}`;
    const last = opsAppErrorsDedupe.get(key) ?? 0;
    if (now - last < OPS_APP_ERRORS_DEDUPE_MS) return;
    opsAppErrorsDedupe.set(key, now);

    const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/ops_app_errors_log_v1`;
    const body = {
      p_source: input.source,
      p_route: input.route ?? "",
      p_last_action: input.lastAction ?? "",
      p_message: input.message,
      p_stack: "",
      p_request_id: input.requestId,
      p_url: input.url,
      p_method: input.method,
      p_http_status: input.status,
      p_code: input.code ?? "",
      p_response_text: input.responseText ?? "",
      p_fingerprint: `${input.source}|${input.route ?? ""}|${input.code ?? ""}|${input.status}|${input.url.split("?")[0]}|${input.message}`.slice(0, 500),
    };

    const headers = new Headers(input.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("x-revo-request-id", input.requestId);

    await rawFetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    // best-effort
  }
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
      const isRest = /\/rest\/v1\//.test(url);
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
          const res = await fetch(input as any, { ...(init ?? {}), headers, signal: controller.signal });

          if (!res.ok && (isRpc || isEdgeFn)) {
            try {
              const cloned = res.clone();
              const responseText = await cloned.text();
              recordNetworkError({
                at: new Date().toISOString(),
                requestId,
                url,
                method,
                status: res.status,
                isRpc,
                isEdgeFn,
                responseText,
              });

              // Erros de rede (RPC/Edge) aparecem em vermelho no console do navegador,
              // mas não passam por console.error. Registramos também no OPS "Erros no Sistema".
              try {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(responseText);
                } catch {
                  parsed = null;
                }
                const code = typeof parsed?.code === "string" ? parsed.code : null;
                const msgRaw =
                  typeof parsed?.message === "string"
                    ? parsed.message
                    : typeof parsed?.error === "string"
                      ? parsed.error
                      : `HTTP_${res.status}`;

                const route = typeof window !== "undefined" ? (window.location?.pathname ?? null) : null;
                const lastAction = getLastUserAction();

                const subject = (() => {
                  if (isRpc) {
                    const m = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
                    return m?.[1] ? `rpc:${decodeURIComponent(m[1])}` : "rpc";
                  }
                  const m = url.match(/\/functions\/v1\/([^/?#]+)/);
                  return m?.[1] ? `fn:${decodeURIComponent(m[1])}` : "fn";
                })();
                const msg = `${subject}: ${msgRaw}`;
                await logOpsAppErrorFetchBestEffort({
                  requestId,
                  url,
                  route,
                  lastAction: lastAction?.label ?? null,
                  source: isRpc ? "network.rpc" : "network.edge",
                  method,
                  status: res.status,
                  code,
                  message: msg,
                  responseText: responseText && responseText.length < 4000 ? responseText : responseText.slice(0, 4000),
                  headers,
                });
              } catch {
                // ignore
              }
            } catch {
              // best-effort
            }
          }

          // Estado da arte: capturar 403 também fora de callRpc (ex.: REST select em app_logs).
          // Best-effort: não quebra o fluxo do usuário nem gera loops (usa rawFetch).
          if (res.status === 403 && (isRpc || isEdgeFn || isRest)) {
            try {
              const cloned = res.clone();
              const txt = await cloned.text();
              let parsed: any = null;
              try {
                parsed = JSON.parse(txt);
              } catch {
                parsed = null;
              }
              const code = typeof parsed?.code === "string" ? parsed.code : null;
              const msg =
                typeof parsed?.message === "string"
                  ? parsed.message
                  : typeof parsed?.error === "string"
                    ? parsed.error
                    : "HTTP_403";
              const details = txt && txt.length < 4000 ? txt : null;

              const route = typeof window !== "undefined" ? (window.location?.pathname ?? null) : null;
              const rpcFn = (() => {
                const mRpc = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
                if (mRpc?.[1]) return `rpc:${decodeURIComponent(mRpc[1])}`;
                const mRest = url.match(/\/rest\/v1\/([^/?#]+)/);
                if (mRest?.[1]) return `rest:${decodeURIComponent(mRest[1])}`;
                const mFn = url.match(/\/functions\/v1\/([^/?#]+)/);
                if (mFn?.[1]) return `fn:${decodeURIComponent(mFn[1])}`;
                return "unknown";
              })();

              await logOps403FetchBestEffort({
                requestId,
                url,
                route,
                rpcFn,
                code,
                message: msg,
                details,
                headers,
              });
            } catch {
              // ignore
            }
          }

          return res;
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
