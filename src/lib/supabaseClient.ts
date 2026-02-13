import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logger } from "@/lib/logger";
import { newRequestId } from "@/lib/requestId";
import { recordNetworkError } from "@/lib/telemetry/networkErrors";
import { getLastUserAction } from "@/lib/telemetry/lastUserAction";
import { buildOpsAppErrorFingerprint } from "@/lib/telemetry/opsAppErrorsFingerprint";
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot";
import { getModalContextStackSnapshot } from "@/lib/telemetry/modalContextStack";
import { recordNetworkTrace } from "@/lib/telemetry/networkTraceBuffer";
import { recordBreadcrumb } from "@/lib/telemetry/breadcrumbsBuffer";
import { recordConsoleRedEvent } from "@/lib/telemetry/consoleRedBuffer";

const rawFetch = globalThis.fetch.bind(globalThis);
const ops403Dedupe = new Map<string, number>();
const OPS403_DEDUPE_MS = 10_000;
const opsAppErrorsDedupe = new Map<string, number>();
const OPS_APP_ERRORS_DEDUPE_MS = 10_000;
const IS_TEST_ENV =
  // Vitest (Vite-powered) sets MODE=test
  import.meta.env.MODE === "test" ||
  // Some setups expose VITEST=true
  import.meta.env.VITEST === "true" ||
  // Fallback for node test runners
  (typeof process !== "undefined" && Boolean((process as any).env?.VITEST));

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const envSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

// Estado da arte:
// - Nada de fallback hardcoded em PROD.
// - Em testes unitários (Vitest), permitimos placeholders para não bloquear o runner;
//   chamadas de rede são mockadas/evitadas e o objetivo aqui é só não quebrar import.
export const supabaseUrl = IS_TEST_ENV ? (envSupabaseUrl || "http://localhost:54321") : envSupabaseUrl;
const supabaseAnonKey = IS_TEST_ENV ? (envSupabaseAnonKey || "test_anon_key") : envSupabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ex.: em .env.local / CI secrets).",
  );
}

function getNetworkSubject(url: string, isRpc: boolean, isEdgeFn: boolean): { kind: "rpc" | "edge"; name: string; label: string } | null {
  if (!isRpc && !isEdgeFn) return null;
  if (isRpc) {
    const m = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
    const name = m?.[1] ? decodeURIComponent(m[1]) : "rpc";
    return { kind: "rpc", name, label: `rpc:${name}` };
  }
  const m = url.match(/\/functions\/v1\/([^/?#]+)/);
  const name = m?.[1] ? decodeURIComponent(m[1]) : "fn";
  return { kind: "edge", name, label: `fn:${name}` };
}

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
    if (IS_TEST_ENV) return;
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
    if (IS_TEST_ENV) return;
    const routeBase = getRoutePathname() ?? input.route ?? null;
    const modalStack = getModalContextStackSnapshot();
    const activeModal = modalStack.length ? modalStack[modalStack.length - 1] : null;
    const now = Date.now();
    const key = buildOpsAppErrorFingerprint({
      route: routeBase,
      code: input.code,
      httpStatus: input.status,
      url: input.url,
      method: input.method,
      message: input.message,
    });
    const last = opsAppErrorsDedupe.get(key) ?? 0;
    if (now - last < OPS_APP_ERRORS_DEDUPE_MS) return;
    opsAppErrorsDedupe.set(key, now);

    const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/ops_app_errors_log_v1`;
    const bodyWithContext: Record<string, unknown> & { p_context: unknown } = {
      p_source: input.source,
      p_route: routeBase ?? "",
      p_last_action: input.lastAction ?? "",
      p_message: input.message,
      p_stack: "",
      p_request_id: input.requestId,
      p_url: input.url,
      p_method: input.method,
      p_http_status: input.status,
      p_code: input.code ?? "",
      p_response_text: input.responseText ?? "",
      p_fingerprint: key,
      p_context: {
        route_base: routeBase,
        modal_context_stack: modalStack.map((m) => ({
          kind: m.kind,
          name: m.name,
          logical_route: m.logicalRoute,
          params: m.params,
          opened_at: m.openedAt,
          base_route_at_open: m.baseRouteAtOpen,
        })),
        modal_active: activeModal
          ? { kind: activeModal.kind, name: activeModal.name, logical_route: activeModal.logicalRoute }
          : null,
      },
    };
    const { p_context: _drop, ...bodyWithoutContext } = bodyWithContext;

    const headers = new Headers(input.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("x-revo-request-id", input.requestId);

    const res = await rawFetch(endpoint, { method: "POST", headers, body: JSON.stringify(bodyWithContext) });
    if (res.ok) return;

    // Compat: se o backend ainda não tem p_context (drift), PostgREST devolve PGRST202/404.
    if (res.status === 404) {
      let txt = "";
      try {
        txt = await res.clone().text();
      } catch {
        txt = "";
      }
      if (/PGRST202/i.test(txt) || /schema cache/i.test(txt) || /p_context/i.test(txt)) {
        await rawFetch(endpoint, { method: "POST", headers, body: JSON.stringify(bodyWithoutContext) });
      }
    }
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
    // In unit tests, avoid background timers/session persistence that can keep the process alive.
    persistSession: IS_TEST_ENV ? false : true,
    autoRefreshToken: IS_TEST_ENV ? false : true,
    detectSessionInUrl: IS_TEST_ENV ? false : true,
  },
  global: {
    fetch: async (input, init) => {
      const requestId = newRequestId();
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isRpc = /\/rest\/v1\/rpc\//.test(url);
      const isEdgeFn = /\/functions\/v1\//.test(url);
      const isRest = /\/rest\/v1\//.test(url);
      const subject = getNetworkSubject(url, isRpc, isEdgeFn);
      const timeoutMs = method === "GET" || method === "HEAD"
        ? 30000
        : isRpc || isEdgeFn
          ? 60000
          : 45000;
      const startedAtMs = Date.now();

      try {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        
        // [FIX] Tenant Leakage: Inject Active Company ID from Session Storage (Per-Tab Isolation)
        // This ensures that the backend receives the correct company context for THIS specific tab/window.
        if (typeof window !== "undefined") {
          const activeEmpresaId = sessionStorage.getItem("revo_active_empresa_id");
          if (activeEmpresaId && !headers.has("x-empresa-id")) {
            headers.set("x-empresa-id", activeEmpresaId);
          }
        }

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
          const durationMs = Date.now() - startedAtMs;
          if ((isRpc || isEdgeFn) && res.ok && subject) {
            recordNetworkTrace({
              request_id: requestId,
              kind: subject.kind,
              name: subject.name,
              method,
              url,
              status_code: res.status,
              duration_ms: durationMs,
              body: init?.body ?? null,
            });
          }

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

              recordBreadcrumb({
                type: "network",
                message: `${subject?.label ?? "network"} → ${res.status}`,
                data: { request_id: requestId, status_code: res.status },
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

                const msg = `${subject?.label ?? "network"}: ${msgRaw}`;

                if (subject) {
                  recordNetworkTrace({
                    request_id: requestId,
                    kind: subject.kind,
                    name: subject.name,
                    method,
                    url,
                    status_code: res.status,
                    duration_ms: durationMs,
                    error_code: code,
                    response_summary: msgRaw,
                    body: init?.body ?? null,
                  });
                }

                recordConsoleRedEvent({
                  level: "error",
                  source: isRpc ? "network.rpc" : "network.edge",
                  message: msg,
                  stack: responseText,
                  request_id: requestId,
                  http_status: res.status,
                  code,
                  url,
                });

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
