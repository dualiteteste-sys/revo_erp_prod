import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SubscriptionSettings from '../../components/settings/billing/SubscriptionSettings';
import SubscriptionPlans from '../../components/billing/SubscriptionPlans';
import { ArrowLeft } from 'lucide-react';

type View = 'status' | 'plans';

const SubscriptionPage: React.FC = () => {
  const [view, setView] = useState<View>('status');

  const renderContent = () => {
    if (view === 'plans') {
      return (
        <div>
          <button 
            onClick={() => setView('status')}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft size={16} />
            Voltar para Gerenciamento
          </button>
          <SubscriptionPlans />
        </div>
      );
    }
    return <SubscriptionSettings onSwitchToPlans={() => setView('plans')} />;
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, x: view === 'plans' ? 30 : -30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: view === 'plans' ? -30 : 30 }}
        transition={{ duration: 0.25 }}
      >
        {renderContent()}
      </motion.div>
    </AnimatePresence>
  );
};

export default SubscriptionPage;
