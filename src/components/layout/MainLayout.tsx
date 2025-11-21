import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import SettingsPanel from '../../pages/settings/SettingsPanel';
import { SubscriptionProvider } from '../../contexts/SubscriptionProvider';
import SubscriptionGuard from './SubscriptionGuard';
import { menuConfig } from '../../config/menuConfig';
import { useAuth } from '../../contexts/AuthProvider';

const findActiveItem = (pathname: string): string => {
  for (const group of menuConfig) {
    if (group.children) {
      for (const child of group.children) {
        if (pathname.startsWith(child.href)) {
          return child.name;
        }
      }
    }
    if (pathname.startsWith(group.href)) {
      return group.name;
    }
  }
  return 'Dashboard'; // Fallback
};

const MainLayout: React.FC = () => {
  const { activeEmpresa, loading: authLoading } = useAuth();
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [wasSidebarExpandedBeforeSettings, setWasSidebarExpandedBeforeSettings] = useState(false);

  // Settings Panel Control
  const [settingsCanClose, setSettingsCanClose] = useState(true);
  const [settingsInitialTab, setSettingsInitialTab] = useState('Geral');
  const [settingsInitialItem, setSettingsInitialItem] = useState('Empresa');

  const location = useLocation();
  const navigate = useNavigate();
  const [activeItem, setActiveItem] = useState(() => findActiveItem(location.pathname));

  useEffect(() => {
    setActiveItem(findActiveItem(location.pathname));
  }, [location.pathname]);

  // Guard: Force Complete Profile
  useEffect(() => {
    if (authLoading || !activeEmpresa) return;

    // Define required fields
    const requiredFields = [
      activeEmpresa.endereco_logradouro,
      activeEmpresa.telefone,
      activeEmpresa.cnpj,
      activeEmpresa.nome_razao_social
    ];

    const isProfileIncomplete = requiredFields.some(field => !field || field.trim() === '');

    if (isProfileIncomplete || activeEmpresa.nome_razao_social === 'Empresa sem Nome') {
      if (!isSettingsPanelOpen) {
        setSettingsCanClose(false);
        setSettingsInitialTab('Geral');
        setSettingsInitialItem('Empresa');
        setIsSettingsPanelOpen(true);
        setIsSidebarCollapsed(true);
      }
    } else {
      setSettingsCanClose(true);
    }
  }, [activeEmpresa, authLoading, isSettingsPanelOpen]);

  const handleOpenSettings = () => {
    setWasSidebarExpandedBeforeSettings(!isSidebarCollapsed);
    setIsSidebarCollapsed(true);
    setSettingsCanClose(true); // Default behavior
    setIsSettingsPanelOpen(true);
  };

  const handleCloseSettings = () => {
    if (!settingsCanClose) return;
    setIsSettingsPanelOpen(false);
    setIsSidebarCollapsed(!wasSidebarExpandedBeforeSettings);
  };

  const handleSetActiveItem = (name: string) => {
    const item = menuConfig.flatMap(g => g.children || g).find(i => i.name === name);
    if (item && item.href && item.href !== '#') {
      navigate(item.href);
    }
    setActiveItem(name);
  };

  return (
    <SubscriptionProvider>
      <div className="h-screen p-4 flex gap-4">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          onOpenSettings={handleOpenSettings}
          onOpenCreateCompanyModal={() => { /* No-op, modal removido */ }}
          activeItem={activeItem}
          setActiveItem={handleSetActiveItem}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <SubscriptionGuard>
            <main className="flex-1 overflow-y-auto scrollbar-styled pr-2">
              <Outlet />
            </main>
          </SubscriptionGuard>
        </div>

        <AnimatePresence>
          {isSettingsPanelOpen && (
            <SettingsPanel
              onClose={handleCloseSettings}
              canClose={settingsCanClose}
              initialTab={settingsInitialTab}
              initialItem={settingsInitialItem}
            />
          )}
        </AnimatePresence>
      </div>
    </SubscriptionProvider>
  );
};

export default MainLayout;
