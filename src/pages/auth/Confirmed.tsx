import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { bootstrapEmpresaParaUsuarioAtual } from '@/services/session';
import { supabase } from '@/lib/supabaseClient';

type Status = 'authenticating' | 'bootstrapping' | 'success' | 'error';

export default function AuthConfirmed() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('authenticating');
  const [message, setMessage] = useState('Confirmando autenticação...');

  const { code, token_hash, type, hashTokens } = useMemo(() => {
    const url = new URL(window.location.href);
    const qs = url.searchParams;
    const code = qs.get('code') ?? '';
    const token_hash = qs.get('token_hash') ?? '';
    const type = (qs.get('type') ?? '').toLowerCase();
    const h = url.hash?.startsWith('#') ? url.hash.slice(1) : url.hash;
    const sp = new URLSearchParams(h);
    const access_token = sp.get('access_token') ?? undefined;
    const refresh_token = sp.get('refresh_token') ?? undefined;
    return { code, token_hash, type, hashTokens: { access_token, refresh_token } };
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setStatus('bootstrapping');
      setMessage('Preparando seu ambiente...');
      try {
        // 1) Estabelece a sessão a partir do link de confirmação (hash/code/token_hash)
        if (hashTokens.access_token && hashTokens.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: hashTokens.access_token,
            refresh_token: hashTokens.refresh_token,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash) {
          const otpType =
            ['invite', 'signup', 'magiclink', 'recovery'].includes(type)
              ? (type as 'invite' | 'signup' | 'magiclink' | 'recovery')
              : 'signup';
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: otpType });
          if (error) throw error;
        }

        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) {
          throw new Error('Falha na autenticação. Faça login novamente.');
        }

        // 2) Bootstrap da empresa (idempotente)
        await bootstrapEmpresaParaUsuarioAtual();
        setStatus('success');
        setMessage('Tudo pronto! Redirecionando...');
        const timer = setTimeout(() => {
          // O MainLayout força a abertura de Configurações → Empresa quando o perfil está incompleto
          navigate('/app', { replace: true });
        }, 1500);
        return () => clearTimeout(timer);
      } catch (err: any) {
        console.error('[BOOTSTRAP] Error:', err);
        setStatus('error');
        setMessage(err?.message || 'Ocorreu um erro ao configurar seu acesso.');
      }
    };

    if (status === 'authenticating') bootstrap();

  }, [navigate, status, code, token_hash, type, hashTokens.access_token, hashTokens.refresh_token]);

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
