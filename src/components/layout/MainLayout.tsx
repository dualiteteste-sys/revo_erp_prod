import React, { useMemo, useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { SubscriptionProvider } from '../../contexts/SubscriptionProvider';
import { AppContextProvider } from '@/contexts/AppContextProvider';
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
import TenantQueryCacheGuard from '@/components/tenant/TenantQueryCacheGuard';
import ContextualHelp from '@/components/support/ContextualHelp';
import PostInviteWelcomeModal from '@/components/onboarding/PostInviteWelcomeModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import MobileBottomNav from './MobileBottomNav';
import MobileTopBar from './MobileTopBar';
import { getDefaultSettingsRoute, resolveSettingsRouteFromLegacyParam } from '@/lib/settingsRoute';

const LayoutDebugOverlay = import.meta.env.DEV
  ? React.lazy(() => import('@/components/dev/LayoutDebugOverlay'))
  : null;

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
  const isMobile = useIsMobile();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED);
      if (raw === null) return false;
      return raw === 'true';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [activeItem, setActiveItem] = useState(() => findActiveHref(location.pathname));
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);
  const [onboardingAutoOpenPending, setOnboardingAutoOpenPending] = useState(false);
  const [onboardingForceStepKey, setOnboardingForceStepKey] = useState<string | null>(null);
  const [isPostInviteWelcomeOpen, setIsPostInviteWelcomeOpen] = useState(false);

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

  // Pós-convite "estado da arte+": mostra um welcome leve (não bloqueia) com CTA para wizard/assinatura/usuários.
  useEffect(() => {
    if (authLoading || !activeEmpresa) return;
    try {
      const raw = sessionStorage.getItem('revo:post_auth_welcome');
      if (!raw) return;
      sessionStorage.removeItem('revo:post_auth_welcome');
      setIsPostInviteWelcomeOpen(true);
    } catch {
      // ignore
    }
  }, [activeEmpresa, authLoading]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, String(isSidebarCollapsed));
    } catch {
      // ignore
    }
  }, [isSidebarCollapsed]);

  // Gate suave: abre o assistente automaticamente quando vindo do onboarding inicial (query param)
  // e mantém compatibilidade com links antigos /app?settings=...
  useEffect(() => {
    if (authLoading || !activeEmpresa) return;

    // On first access after onboarding form, open wizard once profile is not forcing settings.
    if (onboardingParam) {
      setOnboardingAutoOpenPending(true);
      navigate(location.pathname, { replace: true });
    }

    if (settingsParam) {
      const destination = resolveSettingsRouteFromLegacyParam(settingsParam);
      navigate(destination, { replace: true });
      return;
    }

    if (onboardingAutoOpenPending && !isOnboardingWizardOpen) {
      setOnboardingAutoOpenPending(false);
      setIsOnboardingWizardOpen(true);
    }
  }, [
    activeEmpresa,
    authLoading,
    isSidebarCollapsed,
    onboardingAutoOpenPending,
    onboardingParam,
    settingsParam,
    navigate,
    location.pathname,
    isOnboardingWizardOpen,
  ]);

  const handleOpenSettings = () => {
    navigate(getDefaultSettingsRoute());
  };

  const handleSetActiveItem = (href: string) => {
    if (href && href !== '#') navigate(href);
    setActiveItem(href);
  };

  return (
    <SubscriptionProvider>
      <AppContextProvider>
        <OnboardingGateProvider
          openWizard={async (stepKey) => {
            setOnboardingForceStepKey(stepKey ?? null);
            setIsOnboardingWizardOpen(true);
          }}
        >
          <RoadmapProvider>
            <TenantQueryCacheGuard />

            {/* Container principal - responsivo */}
            <div className={`h-screen flex ${isMobile ? 'flex-col' : 'p-4 gap-4'}`}>
              <CommandPalette />
              {import.meta.env.DEV && LayoutDebugOverlay && (
                <React.Suspense fallback={null}>
                  <LayoutDebugOverlay />
                </React.Suspense>
              )}
              <OnboardingWizardModal
                isOpen={isOnboardingWizardOpen}
                mode="auto"
                forceStepKey={onboardingForceStepKey}
                onClose={() => {
                  setIsOnboardingWizardOpen(false);
                  setOnboardingForceStepKey(null);
                }}
              />
              <PostInviteWelcomeModal
                isOpen={isPostInviteWelcomeOpen}
                onClose={() => setIsPostInviteWelcomeOpen(false)}
              />
              <PlanIntentCheckoutModal />

              {/* Mobile: Top Bar */}
              {isMobile && <MobileTopBar />}

              {/* Desktop: Sidebar (oculta em mobile) */}
              {!isMobile && (
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
              )}

              {/* Conteúdo principal */}
              <div className={`flex-1 flex flex-col overflow-hidden ${isMobile ? 'pb-20' : ''}`}>
                <SubscriptionGuard>
                  {/* Banners (apenas desktop) */}
                  {!isMobile && (
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
                  )}

                  <main
                    className={`flex-1 overflow-y-auto overflow-x-hidden scrollbar-styled flex flex-col min-h-0 ${isMobile ? 'px-4' : 'pr-2'}`}
                    tabIndex={0}
                    aria-label="Conteúdo principal"
                  >
                    <ContextualHelp />
                    <div className="flex-1 min-h-0">
                      <Outlet />
                    </div>
                  </main>
                </SubscriptionGuard>
              </div>

              {/* Mobile: Bottom Navigation (fixo no bottom) */}
              {isMobile && <MobileBottomNav onOpenSettings={handleOpenSettings} />}
            </div>
          </RoadmapProvider>
        </OnboardingGateProvider>
      </AppContextProvider>
    </SubscriptionProvider>
  );
};

export default MainLayout;
