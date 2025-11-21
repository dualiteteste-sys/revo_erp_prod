import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { bootstrapEmpresaParaUsuarioAtual } from '@/services/session';

type Status = 'authenticating' | 'bootstrapping' | 'success' | 'error';

export default function AuthConfirmed() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status>('authenticating');
  const [message, setMessage] = useState('Confirmando autenticação...');

  useEffect(() => {
    if (authLoading) {
      return; // Wait for the AuthProvider to finish loading the session
    }

    if (!session) {
      setMessage('Falha na autenticação. Redirecionando para o login...');
      setStatus('error');
      const timer = setTimeout(() => {
        navigate('/auth/login', { replace: true });
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Session is ready, now bootstrap the company
    const bootstrap = async () => {
      setStatus('bootstrapping');
      setMessage('Preparando seu ambiente...');
      try {
        await bootstrapEmpresaParaUsuarioAtual();
        setStatus('success');
        setMessage('Tudo pronto! Redirecionando para o dashboard...');
        const timer = setTimeout(() => {
          navigate('/app', { replace: true });
        }, 1500);
        return () => clearTimeout(timer);
      } catch (err: any) {
        console.error('[BOOTSTRAP] Error:', err);
        setStatus('error');
        setMessage(err.message || 'Ocorreu um erro ao configurar sua empresa.');
      }
    };

    if (status === 'authenticating') {
        bootstrap();
    }

  }, [session, authLoading, navigate, status]);

  const renderStatus = () => {
    switch (status) {
      case 'success':
        return { icon: <CheckCircle className="w-12 h-12 text-green-600" />, title: "Sucesso!" };
      case 'error':
        return { icon: <AlertTriangle className="w-12 h-12 text-red-600" />, title: "Ocorreu um Erro" };
      default:
        return { icon: <Loader2 className="w-12 h-12 animate-spin text-blue-600" />, title: "Aguarde um momento" };
    }
  };

  const { icon, title } = renderStatus();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="bg-white/70 backdrop-blur-xl border border-white/40 rounded-3xl shadow-lg p-8 text-center w-full max-w-md">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-xl font-bold mb-2 text-gray-800">{title}</h1>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}
