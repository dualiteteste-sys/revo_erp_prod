import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../../contexts/SubscriptionProvider';
import BillingBlockPage from '../../pages/billing/BillingBlockPage';
import { getBillingAccessLevel } from '@/lib/billingAccess';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children }) => {
  const { subscription, loadingSubscription } = useSubscription();
  const location = useLocation();

  if (loadingSubscription) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <div className="w-12 h-12 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
      </div>
    );
  }

  // Estado da arte: empresa SEM assinatura não deve navegar no core do ERP,
  // para evitar estados inconsistentes (ex.: 403 por ausência de plano/entitlements).
  if (!subscription) {
    const path = location.pathname || '';
    const allowNoSub =
      // Permite acessar a tela de assinatura e demais configurações para corrigir o estado.
      path.startsWith('/app/configuracoes') ||
      // Mantém ferramentas internas acessíveis (triagem/recuperação).
      path.startsWith('/app/desenvolvedor');

    if (allowNoSub) return <>{children}</>;

    return (
      <Navigate
        to="/app/configuracoes/geral/assinatura"
        replace
        state={{ from: location, reason: 'no_subscription' }}
      />
    );
  }

  const level = getBillingAccessLevel(subscription);

  // Soft block: allow navigation, but critical actions should be gated.
  if (level === 'soft') return <>{children}</>;

  // Hard block: block the app.
  if (level === 'hard') return <BillingBlockPage subscription={subscription} />;

  return <>{children}</>;
};

export default SubscriptionGuard;
