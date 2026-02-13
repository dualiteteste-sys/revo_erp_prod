import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabaseClient";
import { sanitizeLogData } from "@/lib/sanitizeLog";
import { getLastRequestId } from "@/lib/requestId";
import { getRecentNetworkErrors } from "@/lib/telemetry/networkErrors";
import { getLastUserAction, setupLastUserActionTracking } from "@/lib/telemetry/lastUserAction";
import { buildOpsAppErrorFingerprint } from "@/lib/telemetry/opsAppErrorsFingerprint";
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot";
import { getModalContextStackSnapshot } from "@/lib/telemetry/modalContextStack";
import { recordConsoleRedEvent } from "@/lib/telemetry/consoleRedBuffer";
import { isKnownExternalNoise } from "@/lib/telemetry/errorBus";

type AnyFunction = (...args: unknown[]) => unknown;

type SupabaseRpcErrorShape = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

type SupabaseRpcResultShape = {
  data?: unknown;
  error?: SupabaseRpcErrorShape | null;
  status?: number;
};

type SupabaseRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<SupabaseRpcResultShape>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeToString(value: unknown) {
  try {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shouldIgnoreNoise(input: { message: unknown; source?: string | null; url?: string | null }) {
  return isKnownExternalNoise(input.message, input.source, input.url);
}

let lastOpsCollectorOkAt: number | null = null;
let lastOpsCollectorErrorAt: number | null = null;
let lastOpsCollectorErrorMessage: string | null = null;

export function getOpsCollectorStatusSnapshot() {
  return {
    ok_at: lastOpsCollectorOkAt,
    error_at: lastOpsCollectorErrorAt,
    error_message: lastOpsCollectorErrorMessage,
  };
}

export function setupGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  const rpcClient = supabase as unknown as SupabaseRpcClient;

  const recentlySent = new Map<string, number>();
  const recentlySentOps = new Map<string, number>();
  const DEDUPE_WINDOW_MS = 10_000;

  setupLastUserActionTracking();

  const logOpsAppErrorRpcBestEffort = async (
    argsWithContext: Record<string, unknown>,
    argsWithoutContext: Record<string, unknown>,
  ) => {
    try {
      const res = await rpcClient.rpc("ops_app_errors_log_v1", argsWithContext);
      if (!res?.error) {
        lastOpsCollectorOkAt = Date.now();
        return;
      }

      const code = String(res.error?.code ?? "");
      const msg = String(res.error?.message ?? "");
      const details = String(res.error?.details ?? "");

      // Backward compatibility: se o backend ainda não tem p_context (drift DEV/PROD),
      // o PostgREST devolve PGRST202/404. Re-tentamos sem p_context.
      const missingArg =
        code === "PGRST202" ||
        (res?.status === 404 && /schema cache/i.test(details || msg)) ||
        /p_context/i.test(details || msg);

      if (!missingArg) {
        lastOpsCollectorErrorAt = Date.now();
        lastOpsCollectorErrorMessage = `${code || "RPC_ERROR"}: ${msg || "ops_app_errors_log_v1 falhou"}`.slice(0, 200);
        return;
      }

      const retry = await rpcClient.rpc("ops_app_errors_log_v1", argsWithoutContext);
      if (!retry?.error) {
        lastOpsCollectorOkAt = Date.now();
      } else {
        const code2 = String(retry.error?.code ?? "");
        const msg2 = String(retry.error?.message ?? "");
        lastOpsCollectorErrorAt = Date.now();
        lastOpsCollectorErrorMessage = `${code2 || "RPC_ERROR"}: ${msg2 || "ops_app_errors_log_v1 falhou (retry)"}`.slice(0, 200);
      }
    } catch (e: unknown) {
      lastOpsCollectorErrorAt = Date.now();
      lastOpsCollectorErrorMessage = String((e as { message?: unknown } | null)?.message || "ops_app_errors_log_v1 exception").slice(
        0,
        200,
      );
    }
  };

  const trySendAppLog = (params: { event: string; message: string; context?: Record<string, unknown> }) => {
    try {
      if (!supabase) return;

      const key = `${params.event}::${params.message}`;
      const now = Date.now();
      const last = recentlySent.get(key) ?? 0;
      if (now - last < DEDUPE_WINDOW_MS) return;
      recentlySent.set(key, now);

      const safe = sanitizeLogData({ message: params.message, context: params.context ?? {} });
      const safeObj = isRecord(safe) ? safe : null;
      const safeMessage = safeObj?.message;
      const safeContextRaw = safeObj?.context;
      const safeContext = isRecord(safeContextRaw) ? safeContextRaw : {};

      void (supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc("log_app_event", {
        p_level: "error",
        p_event: params.event,
        p_message: String(typeof safeMessage === "string" ? safeMessage : params.message),
        p_context: safeContext,
        p_source: "ui",
      });
    } catch {
      // never throw from global handlers
    }
  };

  const trySendOpsSystemError = (params: {
    source: string;
    message: string;
    stack?: string | null;
    hintCode?: string | null;
  }) => {
    try {
      if (!supabase) return;

      const lastAction = getLastUserAction();
      const routeBase = getRoutePathname() ?? (window.location?.pathname ?? null);
      const modalStack = getModalContextStackSnapshot();
      const activeModal = modalStack.length ? modalStack[modalStack.length - 1] : null;
      const routeForFingerprint = `${routeBase ?? ""}${activeModal?.logicalRoute ? `::${activeModal.logicalRoute}` : activeModal?.name ? `::modal:${activeModal.name}` : ""}`;
      const requestId = getLastRequestId();
      const recentNet = getRecentNetworkErrors();
      const lastNet = recentNet[0] ?? null;

      const fingerprint = buildOpsAppErrorFingerprint({
        route: routeForFingerprint,
        code: params.hintCode,
        httpStatus: lastNet?.status ?? null,
        url: lastNet?.url ?? null,
        method: lastNet?.method ?? null,
        message: params.message,
      });

      const now = Date.now();
      const last = recentlySentOps.get(fingerprint) ?? 0;
      if (now - last < DEDUPE_WINDOW_MS) return;
      recentlySentOps.set(fingerprint, now);

      const argsWithContext = {
        p_source: params.source,
        p_route: routeBase ?? "",
        p_last_action: lastAction?.label ?? "",
        p_message: params.message,
        p_stack: params.stack ?? "",
        p_request_id: requestId ?? "",
        p_url: lastNet?.url ?? "",
        p_method: lastNet?.method ?? "",
        p_http_status: lastNet?.status ?? null,
        p_code: params.hintCode ?? "",
        p_response_text: lastNet?.responseText ?? "",
        p_fingerprint: fingerprint,
        p_context: {
          route_base: routeBase,
          full_context_string: routeForFingerprint || routeBase,
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
          last_action_age_ms: lastAction?.ageMs ?? null,
        },
      } as Record<string, unknown>;

      const { p_context: _drop, ...argsWithoutContext } = argsWithContext;
      void logOpsAppErrorRpcBestEffort(argsWithContext, argsWithoutContext);
    } catch {
      // best-effort
    }
  };

  window.addEventListener("error", (event) => {
    const resourceTarget = event.target as (EventTarget & { src?: string; href?: string; outerHTML?: string }) | null;
    const resourceUrl = resourceTarget?.src || resourceTarget?.href || null;
    const resourceMessage =
      resourceUrl && !(event as ErrorEvent).error
        ? `resource-load-failed: ${resourceUrl}`
        : safeToString((event as ErrorEvent).error || (event as ErrorEvent).message);
    if (shouldIgnoreNoise({ message: resourceMessage, source: "window.error", url: resourceUrl })) return;

    recordConsoleRedEvent({
      level: "error",
      source: "window.error",
      message: resourceMessage,
      stack: (event as ErrorEvent)?.error instanceof Error ? (event as ErrorEvent).error.stack ?? (event as ErrorEvent).error.message : null,
      url: resourceUrl,
    });
    trySendOpsSystemError({
      source: "window.error",
      message: resourceMessage,
      stack: (event as ErrorEvent)?.error instanceof Error ? (event as ErrorEvent).error.stack ?? (event as ErrorEvent).error.message : null,
    });
    trySendAppLog({
      event: "window.error",
      message: resourceMessage,
      context: {
        filename: (event as ErrorEvent).filename,
        lineno: (event as ErrorEvent).lineno,
        colno: (event as ErrorEvent).colno,
        resource_url: resourceUrl,
      },
    });
    logger.error("[GLOBAL][window.error]", (event as ErrorEvent).error || (event as ErrorEvent).message, {
      filename: (event as ErrorEvent).filename,
      lineno: (event as ErrorEvent).lineno,
      colno: (event as ErrorEvent).colno,
      resource_url: resourceUrl,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (shouldIgnoreNoise({ message: event.reason, source: "unhandledrejection" })) return;
    recordConsoleRedEvent({
      level: "error",
      source: "unhandledrejection",
      message: event.reason,
      stack: event?.reason instanceof Error ? event.reason.stack ?? event.reason.message : null,
    });
    trySendOpsSystemError({
      source: "unhandledrejection",
      message: safeToString(event.reason),
      stack: event?.reason instanceof Error ? event.reason.stack ?? event.reason.message : null,
    });
    trySendAppLog({
      event: "unhandledrejection",
      message: safeToString(event.reason),
      context: { reason: safeToString(event.reason) },
    });
    logger.error("[GLOBAL][unhandledrejection]", event.reason, {
      reason: safeToString(event.reason),
    });
  });

  const isProd = import.meta.env.PROD;

  const originalConsoleError = console.error.bind(console);
  const originalConsoleWarn = console.warn.bind(console);
  let inConsoleOverride = false;

  console.error = ((...args: unknown[]) => {
    if (inConsoleOverride) {
      if (!isProd) originalConsoleError(...args);
      return;
    }
    inConsoleOverride = true;
    try {
      if (shouldIgnoreNoise({ message: args[0], source: "console.error" })) return;
      const safeArgs = sanitizeLogData(args);
      recordConsoleRedEvent({
        level: "error",
        source: "console.error",
        message: args[0],
        stack: args[0] instanceof Error ? args[0].stack ?? args[0].message : null,
      });
      trySendOpsSystemError({
        source: "console.error",
        message: safeToString(args[0]),
        stack: args[0] instanceof Error ? args[0].stack ?? args[0].message : null,
        hintCode: (() => {
          const raw = safeToString(args[0]);
          const m = raw.match(/\b([A-Z0-9]{4,5}\d{0,2})\b/);
          return m?.[1] ?? null;
        })(),
      });
      trySendAppLog({
        event: "console.error",
        message: safeToString(args[0]),
        context: { args: (Array.isArray(safeArgs) ? safeArgs : []).slice(0, 5) },
      });
      logger.error("[console.error]", args[0], { args: safeArgs });
      if (!isProd) originalConsoleError(...args);
    } finally {
      inConsoleOverride = false;
    }
  }) as AnyFunction;

  console.warn = ((...args: unknown[]) => {
    if (shouldIgnoreNoise({ message: args[0], source: "console.warn" })) {
      if (!isProd) originalConsoleWarn(...args);
      return;
    }
    recordConsoleRedEvent({
      level: "warn",
      source: "console.warn",
      message: args[0],
      stack: args[0] instanceof Error ? args[0].stack ?? args[0].message : null,
    });
    logger.warn("[console.warn]", { args: sanitizeLogData(args) });
    if (!isProd) originalConsoleWarn(...args);
  }) as AnyFunction;

  const originalAlert = window.alert?.bind(window);
  window.alert = ((message?: unknown) => {
    logger.warn("[GLOBAL][alert blocked]", { message: safeToString(message) });
    if (!isProd && originalAlert) originalAlert(message);
  }) as typeof window.alert;
}
