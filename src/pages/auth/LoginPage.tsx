import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Mail, Lock } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import Input from '@/components/ui/forms/Input';
import { logger } from '@/lib/logger';
import { getLoginFailureMessage, isExpectedLoginFailure } from '@/lib/auth/loginError';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();

  const rawFrom = (location.state as any)?.from?.pathname || '/app/dashboard';
  const from = rawFrom === '/app' ? '/app/dashboard' : rawFrom;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('[AUTH][LOGIN] start', { email });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      addToast('Login realizado com sucesso!', 'success');
      try {
        const { data } = await supabase.auth.getUser();
        const meta: any = (data?.user as any)?.user_metadata ?? {};
        if (meta?.must_change_password) {
          const pendingEmpresaId = typeof meta.pending_empresa_id === "string" ? meta.pending_empresa_id : null;
          const qs = pendingEmpresaId ? `?empresa_id=${encodeURIComponent(pendingEmpresaId)}` : "";
          navigate(`/auth/force-change-password${qs}`, { replace: true });
          return;
        }
      } catch {
        // best-effort: se falhar, segue fluxo normal
      }

      navigate(from, { replace: true });
    } catch (err: any) {
      if (isExpectedLoginFailure(err)) {
        logger.warn('[AUTH][LOGIN][EXPECTED_FAILURE]', {
          code: err?.code ?? null,
          status: err?.status ?? null,
          message: err?.message ?? null,
        });
      } else {
        logger.error('[AUTH][LOGIN][ERROR]', err);
      }
      const message = getLoginFailureMessage(err);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const socialLoginNotImplemented = () => {
    addToast('Login social em breve!', 'info');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Bem-vindo de volta!</h2>
      <p className="text-center text-gray-600 mb-6">Faça login para acessar o Ultria ERP.</p>
      
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <Input
            label="Email"
            id="email-login"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="seu@email.com"
            startAdornment={<Mail size={20} />}
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="password-login">Senha</label>
            <Link to="/auth/forgot-password" tabIndex={-1} className="text-xs text-blue-600 hover:underline">
              Esqueci minha senha
            </Link>
          </div>
          <Input
            label=""
            id="password-login"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            startAdornment={<Lock size={20} />}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Entrar'}
        </button>
      </form>
      
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300/50" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white/20 px-2 text-gray-600 backdrop-blur-sm rounded-full">ou continue com</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button onClick={socialLoginNotImplemented} className="flex items-center justify-center gap-2 w-full bg-white/80 border border-gray-300 py-2.5 px-4 rounded-lg hover:bg-white transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.75 8.36,4.73 12.19,4.73C15.28,4.73 17.09,6.8 17.09,6.8L19.09,4.8C19.09,4.8 16.7,2.73 12.2,2.73C6.8,2.73 3,6.79 3,12C3,17.21 6.8,21.27 12.2,21.27C17.6,21.27 21.5,17.5 21.5,12.54C21.5,11.83 21.45,11.46 21.35,11.1Z"></path></svg>
          Google
        </button>
        <button onClick={socialLoginNotImplemented} className="flex items-center justify-center gap-2 w-full bg-white/80 border border-gray-300 py-2.5 px-4 rounded-lg hover:bg-white transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12C2,16.42 4.87,20.17 8.84,21.5C9.34,21.58 9.5,21.27 9.5,21C9.5,20.77 9.5,20.14 9.5,19.31C6.73,19.91 6.14,17.97 6.14,17.97C5.68,16.81 5.03,16.5 5.03,16.5C4.12,15.88 5.1,15.9 5.1,15.9C6.1,15.97 6.63,16.93 6.63,16.93C7.5,18.45 8.97,18 9.54,17.76C9.63,17.11 9.89,16.67 10.17,16.42C7.95,16.17 5.62,15.31 5.62,11.5C5.62,10.39 6,9.5 6.65,8.79C6.55,8.54 6.2,7.5 6.75,6.15C6.75,6.15 7.59,5.88 9.5,7.17C10.29,6.95 11.15,6.84 12,6.84C12.85,6.84 13.71,6.95 14.5,7.17C16.41,5.88 17.25,6.15 17.25,6.15C17.8,7.5 17.45,8.54 17.35,8.79C18,9.5 18.38,10.39 18.38,11.5C18.38,15.32 16.04,16.16 13.83,16.41C14.17,16.72 14.5,17.33 14.5,18.26C14.5,19.6 14.5,20.68 14.5,21C14.5,21.27 14.66,21.59 15.17,21.5C19.14,20.16 22,16.42 22,12A10,10 0 0,0 12,2Z"></path></svg>
          GitHub
        </button>
      </div>

      <p className="text-center text-sm text-gray-600 mt-6">
        Não tem uma conta?{' '}
        <a href="/#pricing" className="font-medium text-blue-600 hover:underline focus:outline-none">
          Veja os planos e crie sua conta
        </a>
      </p>
    </motion.div>
  );
};

export default LoginPage;
