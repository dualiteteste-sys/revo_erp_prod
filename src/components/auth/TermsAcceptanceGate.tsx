import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { acceptCurrentTerms, getCurrentTermsDocument, getTermsAcceptanceStatus } from '@/services/termsAcceptance';
import { logger } from '@/lib/logger';

const FullscreenLoading = ({ label }: { label: string }) => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 border-4 border-blue-500 border-dashed rounded-full animate-spin" />
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  </div>
);

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
  const [ackError, setAckError] = useState<string | null>(null);

  const docQueryKey = useMemo(() => ['terms_document_current', 'ultria_erp_terms'], []);
  const statusQueryKey = useMemo(() => ['terms_acceptance_status', 'ultria_erp_terms', empresaId, userId], [empresaId, userId]);

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
      setAckError(null);
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      return acceptCurrentTerms({ origin: 'web', userAgent });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    },
    onError: (err) => {
      logger.warn('[TERMS][ACCEPT][ERROR]', err);
      setAckError('Não foi possível registrar seu aceite. Recarregue a página e tente novamente.');
    },
  });

  if (docQuery.isLoading || statusQuery.isLoading) {
    return <FullscreenLoading label="Verificando Termo de Aceite…" />;
  }

  if (docQuery.error || !docQuery.data) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <GlassCard className="w-full max-w-xl p-6">
          <h2 className="text-xl font-semibold text-slate-900">Termo de Aceite indisponível</h2>
          <p className="text-sm text-slate-600 mt-2">
            Não conseguimos carregar o termo vigente. Isso bloqueia o acesso por segurança.
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => window.location.reload()}>Recarregar</Button>
            <Button variant="outline" onClick={() => onDecline()}>
              Sair
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (statusQuery.error || !statusQuery.data) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <GlassCard className="w-full max-w-xl p-6">
          <h2 className="text-xl font-semibold text-slate-900">Não foi possível validar seu aceite</h2>
          <p className="text-sm text-slate-600 mt-2">
            O sistema não conseguiu confirmar sua empresa ativa (tenant) para este acesso. Por segurança, o acesso foi bloqueado.
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => window.location.reload()}>Recarregar</Button>
            <Button variant="outline" onClick={() => onDecline()}>
              Sair
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (statusQuery.data.is_accepted) {
    return <>{children}</>;
  }

  return (
    <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <GlassCard className="w-full max-w-4xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Termo de Aceite</h1>
            <p className="text-sm text-slate-600 mt-1">
              Para continuar, você precisa aceitar os termos vigentes desta empresa.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Versão vigente: {docQuery.data.version}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white/60 overflow-hidden">
          <div className="max-h-[55vh] overflow-auto p-4">
            <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans">
              {docQuery.data.body}
            </pre>
          </div>
        </div>

        {ackError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
            {ackError}
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onDecline()}
            disabled={acceptMutation.isPending}
          >
            Não aceito / Sair
          </Button>
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? 'Registrando…' : 'Aceitar'}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
