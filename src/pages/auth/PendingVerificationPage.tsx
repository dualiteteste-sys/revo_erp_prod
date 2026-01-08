import { useMemo, useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/contexts/ToastProvider';
import { resendSignupConfirmation } from '@/lib/auth';

const PendingVerificationPage = () => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const email = useMemo(() => {
    try {
      return localStorage.getItem('pending_signup_email') || '';
    } catch {
      return '';
    }
  }, []);

  const maskedEmail = useMemo(() => {
    if (!email || !email.includes('@')) return '';
    const [u, d] = email.split('@');
    const userMasked = u.length <= 2 ? `${u[0] || ''}*` : `${u.slice(0, 2)}***${u.slice(-1)}`;
    return `${userMasked}@${d}`;
  }, [email]);

  const onResend = async () => {
    if (!email) {
      addToast('Não conseguimos identificar seu e-mail. Volte e cadastre novamente.', 'error');
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      await resendSignupConfirmation(email);
      addToast('E-mail reenviado. Confira sua caixa de entrada e spam.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenviar o e-mail.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="w-full max-w-md text-center">
        <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Verifique seu e-mail</h1>
          <p className="text-gray-600">
            Enviamos um link de confirmação para o seu endereço de e-mail. Por favor, clique no link para ativar sua conta.
          </p>
          {maskedEmail ? (
            <p className="text-gray-600 mt-2">
              Destinatário: <span className="font-semibold">{maskedEmail}</span>
            </p>
          ) : null}
          <p className="text-gray-500 text-sm mt-4">
            Se não encontrar o e-mail, verifique sua caixa de spam.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onResend}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-white/70 border border-white/40 text-gray-900 font-semibold py-2.5 px-6 rounded-lg hover:bg-white/80 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} size={18} />
              {loading ? 'Reenviando...' : 'Reenviar e-mail'}
            </button>
            <Link to="/auth/signup" className="text-sm text-blue-700 hover:underline">
              Errei o e-mail • criar conta novamente
            </Link>
          </div>
          <Link to="/auth/login" className="inline-block mt-6 bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
            Voltar para o Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PendingVerificationPage;
