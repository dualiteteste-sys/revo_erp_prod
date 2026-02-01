import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabaseClient";
import { sanitizeLogData } from "@/lib/sanitizeLog";
import { getLastRequestId } from "@/lib/requestId";
import { getRecentNetworkErrors } from "@/lib/telemetry/networkErrors";
import { getLastUserAction, setupLastUserActionTracking } from "@/lib/telemetry/lastUserAction";

type AnyFunction = (...args: unknown[]) => unknown;

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

export function setupGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  const recentlySent = new Map<string, number>();
  const DEDUPE_WINDOW_MS = 10_000;

  setupLastUserActionTracking();

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

      void supabase.rpc("log_app_event", {
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
      const route = lastAction?.route ?? (window.location?.pathname ?? null);
      const requestId = getLastRequestId();
      const recentNet = getRecentNetworkErrors();
      const lastNet = recentNet[0] ?? null;

      const fingerprint = [
        params.source,
        route ?? "",
        params.hintCode ?? "",
        (lastNet?.status ?? "").toString(),
        (lastNet?.url ?? "").split("?")[0],
        params.message,
      ]
        .join("|")
        .slice(0, 500);

      void (supabase as any).rpc("ops_app_errors_log_v1", {
        p_source: params.source,
        p_route: route ?? "",
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
      });
    } catch {
      // best-effort
    }
  };

  window.addEventListener("error", (event) => {
    trySendOpsSystemError({
      source: "window.error",
      message: safeToString(event.error || event.message),
      stack: event?.error instanceof Error ? event.error.stack ?? event.error.message : null,
    });
    trySendAppLog({
      event: "window.error",
      message: safeToString(event.error || event.message),
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
    logger.error("[GLOBAL][window.error]", event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
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

  console.error = ((...args: unknown[]) => {
    const safeArgs = sanitizeLogData(args);
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
  }) as AnyFunction;

  console.warn = ((...args: unknown[]) => {
    logger.warn("[console.warn]", { args: sanitizeLogData(args) });
    if (!isProd) originalConsoleWarn(...args);
  }) as AnyFunction;

  const originalAlert = window.alert?.bind(window);
  window.alert = ((message?: any) => {
    logger.warn("[GLOBAL][alert blocked]", { message: safeToString(message) });
    if (!isProd && originalAlert) originalAlert(message);
  }) as any;
}
