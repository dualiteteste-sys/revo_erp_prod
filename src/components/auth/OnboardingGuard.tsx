import React from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const OnboardingGuard = ({ children }: { children: JSX.Element }) => {
  const { empresas, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
      </div>
    );
  }

  // After loading, if a user is logged in but has no company, it's an error state.
  // The backend trigger should have created one.
  if (!loading && empresas.length === 0) {
    // Avoid redirect loop if we are already on an error page or similar
    if (location.pathname.startsWith('/app')) {
        return (
            <div className="w-screen h-screen flex items-center justify-center p-4 bg-red-50">
                <div className="max-w-md text-center bg-white p-8 rounded-2xl shadow-lg">
                    <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
                    <h1 className="mt-4 text-xl font-bold text-gray-800">Erro de Configuração</h1>
                    <p className="mt-2 text-gray-600">
                        Não foi possível encontrar ou criar uma empresa para sua conta. Isso pode ser um erro temporário.
                    </p>
                    <button
                        onClick={() => signOut()}
                        className="mt-6 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700"
                    >
                        Sair e tentar novamente
                    </button>
                </div>
            </div>
        );
    }
  }
  
  return children;
};

export default OnboardingGuard;
