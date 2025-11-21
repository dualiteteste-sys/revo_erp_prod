import React from 'react';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { Loader2, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FeatureGuardProps {
  feature: 'revo_send_enabled';
  children: React.ReactNode;
}

const UpgradeGate: React.FC<{ featureName: string }> = ({ featureName }) => (
  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl">
    <div className="text-center max-w-lg">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
          <Lock className="w-10 h-10 text-yellow-600" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Recurso Bloqueado</h1>
      <p className="text-gray-600 mb-6">
        O módulo <span className="font-semibold">{featureName}</span> não está ativo para sua empresa.
        Ative o add-on para ter acesso a esta funcionalidade.
      </p>
      <Link 
        to="/revo-send"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Ver Planos do REVO Send
      </Link>
    </div>
  </div>
);

const FeatureGuard: React.FC<FeatureGuardProps> = ({ feature, children }) => {
  const { loading, ...flags } = useFeatureFlags();

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  const featureNameMap = {
    revo_send_enabled: 'REVO Send',
  };

  if (flags[feature]) {
    return <>{children}</>;
  }

  return <UpgradeGate featureName={featureNameMap[feature]} />;
};
