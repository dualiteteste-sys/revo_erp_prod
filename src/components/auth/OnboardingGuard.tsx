import React from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

const OnboardingGuard = ({ children }: { children: JSX.Element }) => {
  const { empresas, loading, refreshEmpresas, signOut } = useAuth();
  const location = useLocation();
  const [attempt, setAttempt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  const shouldRecover = !loading && empresas.length === 0 && location.pathname.startsWith('/app');

  React.useEffect(() => {
    if (!shouldRecover) {
      setAttempt(0);
      setFailed(false);
      return;
    }

    if (attempt >= 3) {
      setFailed(true);
      return;
    }

    const delayMs = attempt === 0 ? 0 : 800 * attempt;
    const t = window.setTimeout(async () => {
      try {
        await refreshEmpresas();
      } catch {
        // erros já são logados pelo provider/mutation
      } finally {
        setAttempt((a) => a + 1);
      }
    }, delayMs);

    return () => window.clearTimeout(t);
  }, [shouldRecover, attempt, refreshEmpresas]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
      </div>
    );
  }

  if (shouldRecover) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="max-w-md w-full text-center bg-white/70 backdrop-blur-xl border border-white/40 p-8 rounded-3xl shadow-lg">
          {failed ? (
            <>
              <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
              <h1 className="mt-4 text-xl font-bold text-gray-800">Não conseguimos preparar sua empresa</h1>
              <p className="mt-2 text-sm text-gray-600">
                Isso pode ser um erro temporário. Tente novamente — se persistir, saia e entre de novo.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={() => {
                    setAttempt(0);
                    setFailed(false);
                  }}
                  className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={() => signOut()}
                  className="bg-white text-gray-800 font-semibold py-2 px-4 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  Sair
                </button>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
              <h1 className="mt-4 text-xl font-bold text-gray-800">Preparando seu acesso…</h1>
              <p className="mt-2 text-sm text-gray-600">
                Criando ou vinculando sua empresa. Isso costuma levar alguns segundos.
              </p>
              <p className="mt-3 text-xs text-gray-500">Tentativa {Math.min(attempt + 1, 3)}/3</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return children;
};

export default OnboardingGuard;
