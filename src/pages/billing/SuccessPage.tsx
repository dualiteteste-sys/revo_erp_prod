import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '../../contexts/AuthProvider';

const SuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const supabase = useSupabase();
  const { session } = useAuth();
  const [status, setStatus] = useState<'loading' | 'polling' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId || !session) {
      setStatus('error');
      setError('ID da sessão inválido ou sessão de usuário não encontrada.');
      return;
    }

    // Anti-loop (estado da arte): se chegamos em /app/billing/success, o checkout do Stripe já foi concluído.
    // Então limpamos imediatamente o intent do pricing para evitar reabertura do modal de CNPJ ao navegar (back/refresh).
    try {
      localStorage.removeItem('pending_plan_slug');
      localStorage.removeItem('pending_plan_cycle');
    } catch {
      // ignore
    }

    const fetchSessionData = async () => {
      if (pollCount > 10) { // Limit polling to ~30 seconds
        setStatus('error');
        setError('Não foi possível confirmar sua assinatura. Por favor, verifique a página "Minha Assinatura" ou contate o suporte.');
        return;
      }

      try {
        const { data: responseData, error: responseError } = await supabase.functions.invoke(`billing-success-session?session_id=${sessionId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (responseError) throw responseError;

        if (responseData.state === 'pending') {
          setStatus('polling');
          setTimeout(() => setPollCount(prev => prev + 1), 3000);
        } else {
          setStatus('success');

          // Estado da arte: garantir que a assinatura/entitlements já estejam sincronizados
          // sem exigir clique manual em "Sincronizar com Stripe".
          try {
            const empresaId = responseData?.company?.id ?? responseData?.company?.empresa_id ?? responseData?.subscription?.empresa_id;
            if (empresaId) {
              await supabase.functions.invoke('billing-sync-subscription', {
                body: { empresa_id: empresaId },
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              window.dispatchEvent(new Event('empresa-features-refresh'));
            }
          } catch {
            // best-effort: não bloquear sucesso do usuário
          }
        }
      } catch (e: any) {
        setStatus('error');
        setError(e.message || 'Ocorreu um erro ao verificar sua assinatura.');
      }
    };

    if (status === 'loading' || status === 'polling') {
      fetchSessionData();
    }

  }, [sessionId, session, pollCount, status, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 text-center">
        {status === 'error' ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900">Não foi possível confirmar sua assinatura</h1>
            <p className="mt-2 text-sm text-gray-600">{error || 'Tente novamente em alguns instantes.'}</p>
            <Link
              to="/app/configuracoes/geral/assinatura"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Ir para Minha Assinatura
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-blue-500 border-dashed animate-spin" />
            <h1 className="text-lg font-semibold text-gray-900">
              {status === 'success' ? 'Assinatura confirmada' : 'Confirmando assinatura…'}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {status === 'success' ? 'Tudo certo. Você já pode acessar o sistema.' : 'Isso costuma levar alguns segundos.'}
            </p>
            {status === 'success' ? (
              <Link
                to="/app/dashboard"
                className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Entrar no sistema
              </Link>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default SuccessPage;
