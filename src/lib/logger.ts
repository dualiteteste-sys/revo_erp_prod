import * as Sentry from "@sentry/react";
import { sanitizeLogData } from "@/lib/sanitizeLog";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
    [key: string]: any;
}

const originalConsole = {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
};

let lastSentryEventId: string | null = null;

export function getLastSentryEventId() {
    return lastSentryEventId;
}

class Logger {
    private isDev = import.meta.env.DEV;
    private isTest = import.meta.env.MODE === "test";

    private formatMessage(level: LogLevel, message: string, context?: LogContext) {
        const timestamp = new Date().toISOString();
        return {
            timestamp,
            level,
            message,
            ...(sanitizeLogData(context ?? {}) as any),
        };
    }

    info(message: string, context?: LogContext) {
        const safeContext = sanitizeLogData(context ?? {});
        if (this.isDev) {
            originalConsole.info(`[INFO] ${message}`, safeContext || "");
        }
        // We generally don't send info logs to Sentry to save quota, 
        // unless breadcrumbs are desired.
        Sentry.addBreadcrumb({
            category: "log",
            message,
            level: "info",
            data: safeContext,
        });
    }

    warn(message: string, context?: LogContext) {
        const safeContext = sanitizeLogData(context ?? {});
        if (this.isDev) {
            originalConsole.warn(`[WARN] ${message}`, safeContext || "");
        }
        Sentry.addBreadcrumb({
            category: "log",
            message,
            level: "warning",
            data: safeContext,
        });
    }

    error(message: string, error?: any, context?: LogContext) {
        const safeContext = sanitizeLogData(context ?? {});
        if (this.isDev) {
            originalConsole.error(`[ERROR] ${message}`, error || "", safeContext || "");
        }

        const eventId = Sentry.captureException(error || new Error(message), {
            extra: {
                message,
                ...(safeContext as any),
            },
        });

        if (eventId) {
            lastSentryEventId = eventId;
            try {
                if (!this.isTest && typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("revo:sentry_error_captured", {
                            detail: { eventId, message },
                        })
                    );
                }
            } catch {
                // noop
            }
        }

        return eventId;
    }

    debug(message: string, context?: LogContext) {
        const safeContext = sanitizeLogData(context ?? {});
        if (this.isDev) {
            originalConsole.debug(`[DEBUG] ${message}`, safeContext || "");
        }
    }
}

export const logger = new Logger();
