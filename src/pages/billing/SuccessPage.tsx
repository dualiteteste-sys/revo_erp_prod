import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '../../contexts/AuthProvider';

type SuccessData = {
  company: any;
  subscription: any;
  plan: any;
};

const SuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const supabase = useSupabase();
  const { session } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState<'loading' | 'polling' | 'success' | 'error'>('loading');
  const [data, setData] = useState<SuccessData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId || !session) {
      setStatus('error');
      setError('ID da sessão inválido ou sessão de usuário não encontrada.');
      return;
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
          setData(responseData);
          setStatus('success');
          addToast('Assinatura confirmada com sucesso!', 'success');
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
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              </div>
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
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Pagamento Concluído!</h1>
            <div className="text-left bg-gray-50 p-4 rounded-lg border mb-6">
              <p><strong>Plano:</strong> {data?.plan?.name} ({data?.plan?.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'})</p>
              <p><strong>Status:</strong> <span className="font-semibold capitalize">{data?.subscription?.status}</span></p>
              <p><strong>{data?.subscription?.status === 'trialing' ? 'Término do Teste:' : 'Próxima Cobrança:'}</strong> {new Date(data?.subscription?.current_period_end).toLocaleDateString('pt-BR')}</p>
            </div>
            <p className="text-gray-600 mb-6">
              Sua assinatura foi ativada com sucesso.
            </p>
            <Link to="/app" className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
              Ir para o Dashboard
            </Link>
          </>
        );
      case 'error':
        return (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-12 h-12 text-red-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Ocorreu um Erro</h1>
            <p className="text-gray-600 mb-6">
              {error || 'Não foi possível processar sua solicitação.'}
            </p>
            <Link to="/app/settings" className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
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
