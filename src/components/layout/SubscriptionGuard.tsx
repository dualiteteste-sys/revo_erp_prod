import React from 'react';
import { useSubscription } from '../../contexts/SubscriptionProvider';
import BillingBlockPage from '../../pages/billing/BillingBlockPage';

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

  // If subscription exists, check its status
  const validStatus = ['active', 'trialing'];
  if (validStatus.includes(subscription.status)) {
    return <>{children}</>;
  }

  // If status is not valid, show the billing block page
  return <BillingBlockPage subscription={subscription} />;
};

export default SubscriptionGuard;
