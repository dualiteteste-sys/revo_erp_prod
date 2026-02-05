import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, Lock, Building2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { signUpWithEmail } from '@/lib/auth';
import Input from '@/components/ui/forms/Input';

const SignUpPage: React.FC = () => {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Capture plan intent from URL if present
  const plan = searchParams.get('plan');
  const cycle = searchParams.get('cycle');

  useEffect(() => {
    // Estado da arte: cadastro público só deve acontecer via seleção de plano
    // (evita tenants “sem plano” → 403 intermitente / fallback de permissões).
    if (!plan) {
      addToast('Para criar sua conta, escolha um plano primeiro.', 'info');
      window.location.assign('/#pricing');
    }
  }, [addToast, plan]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) {
      addToast('Escolha um plano antes de criar sua conta.', 'warning');
      window.location.assign('/#pricing');
      return;
    }
    setLoading(true);

    try {
      // We can pass metadata like name directly if the auth function supports it,
      // otherwise it's handled post-signup via triggers or profile updates.
      const res = await signUpWithEmail(email, password, companyName, { plan, cycle });
      const identitiesLen = res?.user?.identities?.length ?? null;

      // Supabase pode retornar "sucesso" com identities vazias quando o e-mail já existe
      // (medida anti-enumeração). Nessa situação, não adianta esperar e-mail de confirmação.
      if (identitiesLen === 0) {
        try {
          localStorage.setItem('pending_signup_email', email.trim().toLowerCase());
        } catch {
          // ignore
        }
        addToast('Este e-mail já possui uma conta. Faça login ou recupere sua senha.', 'warning');
        navigate(`/auth/login?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      
      try {
        localStorage.setItem('pending_signup_email', email.trim().toLowerCase());
        if (companyName.trim()) localStorage.setItem('pending_company_name', companyName.trim());
      } catch {
        // ignore
      }

      addToast('Conta criada com sucesso! Verifique seu e-mail.', 'success');
      
      // If there was a plan selected, we might want to persist it in local storage
      // to apply it after they confirm email and log in.
      if (plan) {
        localStorage.setItem('pending_plan_slug', plan);
        if (cycle) localStorage.setItem('pending_plan_cycle', cycle);
      }

      navigate('/auth/pending-verification');
    } catch (err: any) {
      console.error('[AUTH][SIGNUP][ERROR]', err);
      addToast(err.message || 'Falha ao criar conta.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Crie sua conta</h2>
      <p className="text-center text-gray-600 mb-6">Comece a usar o Ultria ERP hoje mesmo.</p>
      
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <Input
            label="Empresa"
            id="name-signup"
            name="name"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            placeholder="Nome da sua empresa"
            startAdornment={<Building2 size={20} />}
          />
        </div>
        <div>
          <Input
            label="Email"
            id="email-signup"
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
          <Input
            label="Senha"
            id="password-signup"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Mínimo 8 caracteres"
            startAdornment={<Lock size={20} />}
            minLength={8}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Criar Conta'}
        </button>
      </form>
      
      <p className="text-center text-sm text-gray-600 mt-6">
        Já tem uma conta?{' '}
        <Link to="/auth/login" className="font-medium text-blue-600 hover:underline focus:outline-none">
          Faça login
        </Link>
      </p>
    </motion.div>
  );
};

export default SignUpPage;
