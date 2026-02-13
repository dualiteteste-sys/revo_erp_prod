import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import CompanySettingsForm from './company/CompanySettingsForm';
import SubscriptionPage from '../../pages/billing/SubscriptionPage';
import RolesPage from '@/pages/settings/roles/RolesPage';
import UsersPage from '@/pages/settings/general/UsersPage';
import UnidadesPage from '@/pages/settings/general/UnidadesPage';
import UserProfilePage from '@/components/settings/user-profile/UserProfilePage';
import FeatureFlagsPage from '@/components/settings/feature-flags/FeatureFlagsPage';

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
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-gray-800">Integrações</h1>
            <p className="text-sm text-gray-600">
              Centralize conexões de canais e monitore saúde/sincronização sem sair do fluxo operacional.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/app/desenvolvedor/woocommerce"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abrir painel WooCommerce
              </Link>
              <Link
                to="/app/desenvolvedor/saude"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ver monitor de saúde
              </Link>
            </div>
          </div>
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
