import React, { useMemo, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import SettingsPanel from '../../pages/settings/SettingsPanel';
import { SubscriptionProvider } from '../../contexts/SubscriptionProvider';
import SubscriptionGuard from './SubscriptionGuard';
import { menuConfig } from '../../config/menuConfig';
import { useAuth } from '../../contexts/AuthProvider';
import CommandPalette from './CommandPalette';
import OnboardingWizardModal from '@/components/settings/onboarding/OnboardingWizardModal';
import OnboardingGateBanner from '@/components/onboarding/OnboardingGateBanner';
import { OnboardingGateProvider } from '@/contexts/OnboardingGateContext';
import RoadmapButton from '@/components/roadmap/RoadmapButton';
import SubscriptionStatusBanner from '@/components/billing/SubscriptionStatusBanner';
import { PlanIntentCheckoutModal } from '@/components/billing/PlanIntentCheckoutModal';
import { RoadmapProvider } from '@/contexts/RoadmapProvider';
import ContextualHelp from '@/components/support/ContextualHelp';

const findActiveHref = (pathname: string): string => {
  for (const group of menuConfig) {
    if (group.children) {
      for (const child of group.children) {
        if (pathname.startsWith(child.href)) {
          return child.href;
        }
      }
    }
    if (pathname.startsWith(group.href)) {
      return group.href;
    }
  }
  return '/app/dashboard'; // Fallback
};

const STORAGE_SIDEBAR_COLLAPSED = 'ui:sidebarCollapsed';

const MainLayout: React.FC = () => {
  const { activeEmpresa, loading: authLoading } = useAuth();
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED);
      if (raw === null) return false;
      return raw === 'true';
    } catch {
      return false;
    }
  });
  const [wasSidebarExpandedBeforeSettings, setWasSidebarExpandedBeforeSettings] = useState(false);

  // Settings Panel Control
  const [settingsCanClose, setSettingsCanClose] = useState(true);
  const [settingsInitialTab, setSettingsInitialTab] = useState('Geral');
  const [settingsInitialItem, setSettingsInitialItem] = useState('Empresa');
  const forcedSettingsOpenRef = React.useRef(false);

  const location = useLocation();
  const navigate = useNavigate();
  const [activeItem, setActiveItem] = useState(() => findActiveHref(location.pathname));
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);
  const [onboardingAutoOpenPending, setOnboardingAutoOpenPending] = useState(false);
  const [onboardingForceStepKey, setOnboardingForceStepKey] = useState<string | null>(null);

  useEffect(() => {
    setActiveItem(findActiveHref(location.pathname));
  }, [location.pathname]);

  const onboardingParam = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('onboarding') === '1';
    } catch {
      return false;
    }
  }, [location.search]);

  const settingsParam = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('settings');
    } catch {
      return null;
    }
  }, [location.search]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, String(isSidebarCollapsed));
    } catch {
      // ignore
    }
  }, [isSidebarCollapsed]);

  // Gate suave: abre o assistente automaticamente quando vindo do onboarding inicial (query param),
  // e permite abrir o SettingsPanel via query param sem travar o app inteiro.
  useEffect(() => {
    if (authLoading || !activeEmpresa) return;

    // On first access after onboarding form, open wizard once profile is not forcing settings.
    if (onboardingParam) {
      setOnboardingAutoOpenPending(true);
      navigate(location.pathname, { replace: true });
    }

    if (settingsParam && !isSettingsPanelOpen) {
      // Ex.: /app?settings=empresa
      setWasSidebarExpandedBeforeSettings(!isSidebarCollapsed);
      setIsSidebarCollapsed(true);
      setSettingsCanClose(true);
      setIsSettingsPanelOpen(true);
      forcedSettingsOpenRef.current = false;
      if (settingsParam === 'empresa') {
        setSettingsInitialTab('Geral');
        setSettingsInitialItem('Empresa');
      } else if (settingsParam === 'onboarding') {
        setSettingsInitialTab('Geral');
        setSettingsInitialItem('Onboarding (Checklist)');
      } else if (settingsParam === 'billing') {
        setSettingsInitialTab('Geral');
        setSettingsInitialItem('Minha Assinatura');
      }
      navigate(location.pathname, { replace: true });
    }

    if (onboardingAutoOpenPending && !isOnboardingWizardOpen) {
      setOnboardingAutoOpenPending(false);
      setIsOnboardingWizardOpen(true);
    }
  }, [
    activeEmpresa,
    authLoading,
    isSettingsPanelOpen,
    isSidebarCollapsed,
    settingsCanClose,
    wasSidebarExpandedBeforeSettings,
    onboardingAutoOpenPending,
    onboardingParam,
    settingsParam,
    navigate,
    location.pathname,
    isOnboardingWizardOpen,
  ]);

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

  const handleSetActiveItem = (href: string) => {
    if (href && href !== '#') navigate(href);
    setActiveItem(href);
  };

  return (
    <SubscriptionProvider>
      <OnboardingGateProvider
        openWizard={async (stepKey) => {
          setOnboardingForceStepKey(stepKey ?? null);
          setIsOnboardingWizardOpen(true);
        }}
      >
        <RoadmapProvider>
          <div className="h-screen p-4 flex gap-4">
            <CommandPalette />
            <OnboardingWizardModal
              isOpen={isOnboardingWizardOpen}
              mode="auto"
              forceStepKey={onboardingForceStepKey}
              onClose={() => {
                setIsOnboardingWizardOpen(false);
                setOnboardingForceStepKey(null);
              }}
            />
            <PlanIntentCheckoutModal />
            <Sidebar
              isCollapsed={isSidebarCollapsed}
              setIsCollapsed={setIsSidebarCollapsed}
              onOpenSettings={handleOpenSettings}
              onOpenCreateCompanyModal={() => {
                /* No-op, modal removido */
              }}
              activeItem={activeItem}
              setActiveItem={handleSetActiveItem}
            />
            <div className="flex-1 flex flex-col overflow-hidden">
              <SubscriptionGuard>
                <div className="pb-3">
                  <div className="flex justify-end gap-2 items-start flex-wrap">
                    <SubscriptionStatusBanner />
                    <OnboardingGateBanner
                      onOpenWizard={() => {
                        setOnboardingForceStepKey(null);
                        setIsOnboardingWizardOpen(true);
                      }}
                    />
                    <RoadmapButton />
                  </div>
                </div>
                <main className="flex-1 overflow-y-auto scrollbar-styled pr-2" tabIndex={0} aria-label="Conteúdo principal">
                  <ContextualHelp />
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
        </RoadmapProvider>
      </OnboardingGateProvider>
    </SubscriptionProvider>
  );
};

export default MainLayout;
