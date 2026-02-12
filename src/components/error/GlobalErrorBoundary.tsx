import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/logger';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ReportIssueDialog } from '@/components/error/ReportIssueDialog';
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot";
import { getModalContextStackSnapshot } from "@/lib/telemetry/modalContextStack";
import { getLastUserAction } from "@/lib/telemetry/lastUserAction";
import { getNetworkTracesSnapshot } from "@/lib/telemetry/networkTraceBuffer";
import { getBreadcrumbsSnapshot } from "@/lib/telemetry/breadcrumbsBuffer";

interface Props {
    children: ReactNode;
}

type DiagnosticSnapshot = {
    captured_at: string;
    route_base: string | null;
    modal_context_stack: unknown[];
    last_user_action: { label: string; age_ms: number; route: string | null } | null;
    requests_recent: unknown[];
    breadcrumbs: unknown[];
    component_stack?: string | null;
};

interface State {
    hasError: boolean;
    error: Error | null;
    sentryEventId: string | null;
    reportOpen: boolean;
    diagnosticSnapshot: DiagnosticSnapshot | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        sentryEventId: null,
        reportOpen: false,
        diagnosticSnapshot: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, sentryEventId: null, reportOpen: false, diagnosticSnapshot: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const eventId = logger.error('Uncaught error in React component tree', error, {
            componentStack: errorInfo.componentStack,
        });
        const snap: DiagnosticSnapshot = {
            captured_at: new Date().toISOString(),
            route_base: getRoutePathname() ?? (typeof window !== "undefined" ? window.location?.pathname ?? null : null),
            modal_context_stack: getModalContextStackSnapshot(),
            last_user_action: (() => {
                const a = getLastUserAction();
                if (!a) return null;
                return { label: a.label, age_ms: a.ageMs, route: a.route };
            })(),
            requests_recent: getNetworkTracesSnapshot(),
            breadcrumbs: getBreadcrumbsSnapshot(),
            component_stack: errorInfo.componentStack ?? null,
        };

        this.setState({ sentryEventId: eventId ?? null, diagnosticSnapshot: snap });
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            const showInternalLinks = (() => {
                if (import.meta.env.DEV) return true;
                try {
                    return window.location?.pathname?.startsWith('/app/desenvolvedor') ?? false;
                } catch {
                    return false;
                }
            })();

            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                    <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
                        <div className="flex justify-center mb-6">
                            <div className="p-4 bg-red-100 rounded-full">
                                <AlertTriangle className="w-12 h-12 text-red-600" />
                            </div>
                        </div>

                        <h1 className="text-2xl font-bold text-gray-900 mb-2">
                            Ops! Algo deu errado.
                        </h1>

                        <p className="text-gray-600 mb-6">
                            Encontramos um erro inesperado. Nossa equipe já foi notificada (se os logs estiverem configurados).
                        </p>

                        <a
                            href="/app/suporte"
                            className="mb-6 block text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                        >
                            Abrir diagnóstico guiado (Suporte)
                        </a>
                        {showInternalLinks ? (
                            <div className="mb-6 grid grid-cols-1 gap-2">
                                <a
                                    href="/app/desenvolvedor/saude"
                                    className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                                >
                                    Abrir diagnóstico (Saúde)
                                </a>
                                <a
                                    href="/app/desenvolvedor/logs"
                                    className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                                >
                                    Abrir logs (interno)
                                </a>
                                <a
                                    href="/app/desenvolvedor/error-reports"
                                    className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                                >
                                    Abrir error reports (Beta)
                                </a>
                            </div>
                        ) : null}

                        {import.meta.env.DEV && this.state.error && (
                            <div className="mb-6 p-4 bg-gray-100 rounded text-left overflow-auto max-h-48">
                                <p className="font-mono text-xs text-red-600 break-all">
                                    {this.state.error.toString()}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={this.handleReload}
                            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors w-full"
                        >
                            <RefreshCw className="w-5 h-5 mr-2" />
                            Recarregar Aplicação
                        </button>

                        <div className="mt-3">
                            <button
                                type="button"
                                onClick={() => this.setState({ reportOpen: true })}
                                className="w-full inline-flex items-center justify-center px-6 py-3 rounded-md text-base font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 transition-colors"
                            >
                                Enviar para os desenvolvedores
                            </button>
                        </div>
                    </div>

                    <ReportIssueDialog
                        open={this.state.reportOpen}
                        onOpenChange={(open) => this.setState({ reportOpen: open })}
                        sentryEventId={this.state.sentryEventId}
                        error={this.state.error}
                        diagnosticSnapshot={this.state.diagnosticSnapshot}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}
