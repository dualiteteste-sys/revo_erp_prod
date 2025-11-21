import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { sendPasswordResetEmail } from '@/lib/auth';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { addToast } = useToast();
  const [isRateLimited, setIsRateLimited] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRateLimited) {
        addToast('Por favor, aguarde antes de tentar novamente.', 'warning');
        return;
    }
    setLoading(true);

    try {
      await sendPasswordResetEmail(email);
      setSent(true);
    } catch (error: any) {
      if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
        addToast('Limite de envios atingido. Tente novamente em alguns minutos.', 'warning');
        setIsRateLimited(true);
        setTimeout(() => setIsRateLimited(false), 60000); // Disable for 60 seconds
      } else {
        addToast(error.message || 'Falha ao enviar o link de recuperação.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
        <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-green-600" />
            </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Verifique seu e-mail</h2>
        <p className="text-gray-600">
          Se uma conta com o e-mail <strong>{email}</strong> existir, um link para redefinir sua senha foi enviado.
        </p>
        <Link to="/auth/login" className="inline-block mt-6 text-sm font-medium text-blue-600 hover:underline">
          Voltar para o Login
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Recuperar Senha</h2>
      <p className="text-center text-gray-600 mb-6">Digite seu e-mail para receber o link de redefinição.</p>
      
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700" htmlFor="email-forgot">Email</label>
          <input
            id="email-forgot"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full mt-1 p-3 bg-white/50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
            placeholder="seu@email.com"
          />
        </div>
        <button
          type="submit"
          disabled={loading || isRateLimited}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Enviar Link de Recuperação'}
        </button>
      </form>
      
      <p className="text-center text-sm text-gray-600 mt-6">
        Lembrou a senha?{' '}
        <Link to="/auth/login" className="font-medium text-blue-600 hover:underline focus:outline-none">
          Faça login
        </Link>
      </p>
    </motion.div>
  );
};

export default ForgotPasswordPage;
