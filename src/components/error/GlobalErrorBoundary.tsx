import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/logger';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ReportIssueDialog } from '@/components/error/ReportIssueDialog';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    sentryEventId: string | null;
    reportOpen: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        sentryEventId: null,
        reportOpen: false,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, sentryEventId: null, reportOpen: false };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const eventId = logger.error('Uncaught error in React component tree', error, {
            componentStack: errorInfo.componentStack,
        });
        this.setState({ sentryEventId: eventId ?? null });
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
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
                                Abrir logs (se habilitado)
                            </a>
                        </div>

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
                    />
                </div>
            );
        }

        return this.props.children;
    }
}
