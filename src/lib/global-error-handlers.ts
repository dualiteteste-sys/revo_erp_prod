import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabaseClient";

type AnyFunction = (...args: any[]) => any;

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

  const trySendAppLog = (params: { event: string; message: string; context?: Record<string, unknown> }) => {
    try {
      if (!supabase) return;

      const key = `${params.event}::${params.message}`;
      const now = Date.now();
      const last = recentlySent.get(key) ?? 0;
      if (now - last < DEDUPE_WINDOW_MS) return;
      recentlySent.set(key, now);

      void supabase.rpc("log_app_event", {
        p_level: "error",
        p_event: params.event,
        p_message: params.message,
        p_context: params.context ?? {},
        p_source: "ui",
      });
    } catch {
      // never throw from global handlers
    }
  };

  window.addEventListener("error", (event) => {
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
    trySendAppLog({
      event: "console.error",
      message: safeToString(args[0]),
      context: { args: args.slice(0, 5).map(safeToString) },
    });
    logger.error("[console.error]", args[0], { args });
    if (!isProd) originalConsoleError(...(args as any[]));
  }) as AnyFunction;

  console.warn = ((...args: unknown[]) => {
    logger.warn("[console.warn]", { args });
    if (!isProd) originalConsoleWarn(...(args as any[]));
  }) as AnyFunction;

  const originalAlert = window.alert?.bind(window);
  window.alert = ((message?: any) => {
    logger.warn("[GLOBAL][alert blocked]", { message: safeToString(message) });
    if (!isProd && originalAlert) originalAlert(message);
  }) as any;
}
