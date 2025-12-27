import { logger } from "@/lib/logger";

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

  window.addEventListener("error", (event) => {
    logger.error("[GLOBAL][window.error]", event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("[GLOBAL][unhandledrejection]", event.reason, {
      reason: safeToString(event.reason),
    });
  });

  const isProd = import.meta.env.PROD;

  const originalConsoleError = console.error.bind(console);
  const originalConsoleWarn = console.warn.bind(console);

  console.error = ((...args: unknown[]) => {
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

