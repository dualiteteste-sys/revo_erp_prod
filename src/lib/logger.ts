/**
 * Logger Utility
 * Centralizes application logging to allow easy integration with external services (Sentry, Datadog, etc).
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    level: LogLevel;
    message: string;
    data?: any;
    timestamp: string;
}

class LoggerService {
    private isDev: boolean;

    constructor() {
        this.isDev = import.meta.env.DEV;
    }

    private format(level: LogLevel, message: string, data?: any): LogEntry {
        return {
            level,
            message,
            data,
            timestamp: new Date().toISOString(),
        };
    }

    private print(entry: LogEntry) {
        if (this.isDev) {
            const style = {
                info: 'color: #3b82f6',
                warn: 'color: #f59e0b',
                error: 'color: #ef4444',
                debug: 'color: #6b7280',
            };

            console.groupCollapsed(`%c[${entry.level.toUpperCase()}] ${entry.message}`, style[entry.level]);
            console.log('Timestamp:', entry.timestamp);
            if (entry.data) console.log('Data:', entry.data);
            console.groupEnd();
        } else {
            // In production, we might want to be less verbose in the console
            // or only print errors/warnings.
            if (entry.level === 'error' || entry.level === 'warn') {
                console[entry.level](entry.message, entry.data);
            }
        }
    }

    public info(message: string, data?: any) {
        const entry = this.format('info', message, data);
        this.print(entry);
        // TODO: Send to Sentry/Analytics
    }

    public warn(message: string, data?: any) {
        const entry = this.format('warn', message, data);
        this.print(entry);
        // TODO: Send to Sentry
    }

    public error(message: string, error?: any, data?: any) {
        const entry = this.format('error', message, { error, ...data });
        this.print(entry);
        // TODO: Send to Sentry
        // if (window.Sentry) window.Sentry.captureException(error);
    }

    public debug(message: string, data?: any) {
        if (this.isDev) {
            const entry = this.format('debug', message, data);
            this.print(entry);
        }
    }
}

export const Logger = new LoggerService();
