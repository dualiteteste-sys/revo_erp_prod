import * as Sentry from "@sentry/react";

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

class Logger {
    private isDev = import.meta.env.DEV;

    private formatMessage(level: LogLevel, message: string, context?: LogContext) {
        const timestamp = new Date().toISOString();
        return {
            timestamp,
            level,
            message,
            ...context,
        };
    }

    info(message: string, context?: LogContext) {
        if (this.isDev) {
            originalConsole.info(`[INFO] ${message}`, context || "");
        }
        // We generally don't send info logs to Sentry to save quota, 
        // unless breadcrumbs are desired.
        Sentry.addBreadcrumb({
            category: "log",
            message,
            level: "info",
            data: context,
        });
    }

    warn(message: string, context?: LogContext) {
        if (this.isDev) {
            originalConsole.warn(`[WARN] ${message}`, context || "");
        }
        Sentry.addBreadcrumb({
            category: "log",
            message,
            level: "warning",
            data: context,
        });
    }

    error(message: string, error?: any, context?: LogContext) {
        if (this.isDev) {
            originalConsole.error(`[ERROR] ${message}`, error || "", context || "");
        }

        Sentry.captureException(error || new Error(message), {
            extra: {
                message,
                ...context,
            },
        });
    }

    debug(message: string, context?: LogContext) {
        if (this.isDev) {
            originalConsole.debug(`[DEBUG] ${message}`, context || "");
        }
    }
}

export const logger = new Logger();
