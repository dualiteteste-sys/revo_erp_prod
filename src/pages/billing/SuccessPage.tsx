import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '../../contexts/AuthProvider';

const SuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const supabase = useSupabase();
  const { session } = useAuth();
  const { addToast } = useToast();
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
          addToast('Assinatura confirmada com sucesso!', 'success');

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
        addToast(e.message || 'Ocorreu um erro ao verificar sua assinatura.', 'error');
      }
    };

    if (status === 'loading' || status === 'polling') {
      fetchSessionData();
    }

  }, [sessionId, session, pollCount, addToast, status, supabase]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
      case 'polling':
        return (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 border-4 border-blue-500 border-dashed rounded-full animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Finalizando sua assinatura...</h1>
            <p className="text-gray-600 mb-6">
              Estamos confirmando os detalhes do seu pagamento. Isso pode levar alguns segundos.
            </p>
          </>
        );
      case 'success':
        return (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl font-bold text-green-700">
                ✓
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Pagamento Concluído!</h1>
            <p className="text-gray-600 mb-6">
              Sua assinatura foi ativada com sucesso. Você já pode acessar o sistema.
            </p>
            <Link to="/app/dashboard" className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
              Entrar no sistema
            </Link>
          </>
        );
      case 'error':
        return (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl font-bold text-red-700">
                !
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Ocorreu um Erro</h1>
            <p className="text-gray-600 mb-6">
              {error || 'Não foi possível processar sua solicitação.'}
            </p>
            <Link to="/app/configuracoes/geral/assinatura" className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
              Voltar para Configurações
            </Link>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-gray-50 to-blue-100">
      <div className="w-full max-w-md text-center">
        <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default SuccessPage;
