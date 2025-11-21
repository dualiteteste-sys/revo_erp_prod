import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CompanySettingsForm from './company/CompanySettingsForm';
import SubscriptionPage from '../../pages/billing/SubscriptionPage';
import DataManagementContent from './data-management/DataManagementContent';
import RolesPage from '@/pages/settings/roles/RolesPage';
import UsersPage from '@/pages/settings/general/UsersPage';

interface SettingsContentProps {
  activeItem: string;
}

const SettingsContent: React.FC<SettingsContentProps> = ({ activeItem }) => {
  const renderContent = () => {
    switch (activeItem) {
      case 'Empresa':
        return <CompanySettingsForm />;
      case 'Usuários':
        return <UsersPage />;
      case 'Papéis e Permissões':
        return <RolesPage />;
      case 'Minha Assinatura':
        return <SubscriptionPage />;
      case 'Limpeza de Dados':
        return <DataManagementContent />;
      default:
        return (
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{activeItem}</h1>
            <p className="mt-2 text-gray-600">Conteúdo para {activeItem} virá aqui.</p>
          </div>
        );
    }
  };

  return (
    <main className="flex-1 bg-white/40 m-4 ml-0 rounded-2xl overflow-y-auto scrollbar-styled">
       <AnimatePresence mode="wait">
        <motion.div
          key={activeItem}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="p-6 h-full"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </main>
  );
};

export default SettingsContent;
