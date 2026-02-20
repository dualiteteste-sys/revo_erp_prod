import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptCurrentTerms, getCurrentTermsDocument, getTermsAcceptanceStatus } from '@/services/termsAcceptance';

const FullscreenLoading = ({ label }: { label: string }) => (
  <div className="w-full h-screen flex items-center justify-center bg-slate-50 p-6">
    <div className="text-sm text-slate-600">{label}</div>
  </div>
);

const Btn = ({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}) => {
  const base =
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
  const styles =
    variant === 'outline'
      ? 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
      : 'bg-blue-600 text-white hover:bg-blue-700';
  return (
    <button type="button" className={`${base} ${styles}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

export default function TermsAcceptanceGate({
  userId,
  empresaId,
  onDecline,
  children,
}: {
  userId: string;
  empresaId: string;
  onDecline: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  const docQueryKey = ['terms_document_current', 'ultria_erp_terms'] as const;
  const statusQueryKey = ['terms_acceptance_status', 'ultria_erp_terms', empresaId, userId] as const;

  const docQuery = useQuery({
    queryKey: docQueryKey,
    queryFn: getCurrentTermsDocument,
    enabled: Boolean(userId && empresaId),
    staleTime: 60 * 60 * 1000, // 1h
    retry: 1,
  });

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: getTermsAcceptanceStatus,
    enabled: Boolean(userId && empresaId),
    staleTime: 10 * 1000,
    retry: 0, // fail-closed + message acionável
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      return acceptCurrentTerms({ origin: 'web', userAgent });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    },
    onError: (err) => {
      // Best-effort: no logs com detalhes (evita ruído / loops).
      void err;
      try {
        window.alert('Não foi possível registrar o aceite. Recarregue e tente novamente.');
      } catch {
        // ignore
      }
    },
  });

  if (docQuery.isLoading || statusQuery.isLoading) {
    return <FullscreenLoading label="Verificando Termo de Aceite…" />;
  }

  if (docQuery.error || !docQuery.data) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Termo indisponível</h2>
          <p className="text-sm text-slate-600 mt-2">Acesso bloqueado por segurança.</p>
          <div className="mt-6 flex gap-3">
            <Btn onClick={() => window.location.reload()}>Recarregar</Btn>
            <Btn variant="outline" onClick={() => onDecline()}>
              Sair
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  if (statusQuery.error || !statusQuery.data) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Não foi possível validar</h2>
          <p className="text-sm text-slate-600 mt-2">Acesso bloqueado por segurança.</p>
          <div className="mt-6 flex gap-3">
            <Btn onClick={() => window.location.reload()}>Recarregar</Btn>
            <Btn variant="outline" onClick={() => onDecline()}>
              Sair
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  if (statusQuery.data.is_accepted) {
    return <>{children}</>;
  }

  return (
    <div className="w-full h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-4xl p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Termo de Aceite</h1>
            <p className="text-sm text-slate-600 mt-1">
              Aceite os termos para continuar.
            </p>
          </div>
          <div className="text-xs text-slate-500">Versão: {docQuery.data.version}</div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="max-h-[55vh] overflow-auto p-4">
            <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans">
              {docQuery.data.body}
            </pre>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
          <Btn
            variant="outline"
            onClick={() => onDecline()}
            disabled={acceptMutation.isPending}
          >
            Não aceito / Sair
          </Btn>
          <Btn
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? 'Registrando…' : 'Aceitar'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
