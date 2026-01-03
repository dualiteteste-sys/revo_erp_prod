import React from 'react';
import { useSubscription } from '../../contexts/SubscriptionProvider';
import BillingBlockPage from '../../pages/billing/BillingBlockPage';
import { getBillingAccessLevel } from '@/lib/billingAccess';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children }) => {
  const { subscription, loadingSubscription } = useSubscription();

  if (loadingSubscription) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <div className="w-12 h-12 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
      </div>
    );
  }

  // If no subscription exists, allow access (free mode)
  if (!subscription) {
    return <>{children}</>;
  }

  const level = getBillingAccessLevel(subscription);

  // Soft block: allow navigation, but critical actions should be gated.
  if (level === 'soft') return <>{children}</>;

  // Hard block: block the app.
  if (level === 'hard') return <BillingBlockPage subscription={subscription} />;

  return <>{children}</>;
};

export default SubscriptionGuard;
