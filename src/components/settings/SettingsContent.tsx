import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CompanySettingsForm from './company/CompanySettingsForm';
import SubscriptionPage from '../../pages/billing/SubscriptionPage';
import RolesPage from '@/pages/settings/roles/RolesPage';
import UsersPage from '@/pages/settings/general/UsersPage';
import UnidadesPage from '@/pages/settings/general/UnidadesPage';
import UserProfilePage from '@/components/settings/user-profile/UserProfilePage';
import FeatureFlagsPage from '@/components/settings/feature-flags/FeatureFlagsPage';
import WooConnectionPanel from '@/components/settings/ecommerce/WooConnectionPanel';

interface SettingsContentProps {
  activeItem: string;
}

const SettingsContent: React.FC<SettingsContentProps> = ({ activeItem }) => {
  const renderContent = () => {
    switch (activeItem) {
      case 'Empresa':
        return <CompanySettingsForm />;
      case 'Unidades / Filiais':
        return <UnidadesPage />;
      case 'Usuários':
        return <UsersPage />;
      case 'Papéis e Permissões':
        return <RolesPage />;
      case 'Perfil de Usuário':
        return <UserProfilePage />;
      case 'Minha Assinatura':
        return <SubscriptionPage />;
      case 'Feature Flags':
        return <FeatureFlagsPage />;
      case 'Integrações':
        return (
          <WooConnectionPanel />
        );
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
