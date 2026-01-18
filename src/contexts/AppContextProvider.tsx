import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useSubscription } from '@/contexts/SubscriptionProvider';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';

type AppContextValue = {
  session: ReturnType<typeof useAuth>['session'];
  userId: ReturnType<typeof useAuth>['userId'];
  loading: ReturnType<typeof useAuth>['loading'] | ReturnType<typeof useSubscription>['loadingSubscription'];
  empresas: ReturnType<typeof useAuth>['empresas'];
  activeEmpresa: ReturnType<typeof useAuth>['activeEmpresa'];
  activeEmpresaId: ReturnType<typeof useAuth>['activeEmpresaId'];
  mustChangePassword: ReturnType<typeof useAuth>['mustChangePassword'];
  pendingEmpresaId: ReturnType<typeof useAuth>['pendingEmpresaId'];
  refreshEmpresas: ReturnType<typeof useAuth>['refreshEmpresas'];
  setActiveEmpresa: ReturnType<typeof useAuth>['setActiveEmpresa'];
  signOut: ReturnType<typeof useAuth>['signOut'];

  subscription: ReturnType<typeof useSubscription>['subscription'];
  loadingSubscription: ReturnType<typeof useSubscription>['loadingSubscription'];
  refetchSubscription: ReturnType<typeof useSubscription>['refetchSubscription'];

  empresaRole: ReturnType<typeof useEmpresaRole>['data'];
  empresaRoleLoading: boolean;
  isAdminLike: boolean;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const subscription = useSubscription();
  const empresaRoleQuery = useEmpresaRole();

  const isAdminLike = useMemo(() => {
    if (!empresaRoleQuery.isFetched) return false;
    return roleAtLeast(empresaRoleQuery.data, 'admin');
  }, [empresaRoleQuery.data, empresaRoleQuery.isFetched]);

  const value = useMemo<AppContextValue>(() => {
    return {
      session: auth.session,
      userId: auth.userId,
      loading: auth.loading || subscription.loadingSubscription,
      empresas: auth.empresas,
      activeEmpresa: auth.activeEmpresa,
      activeEmpresaId: auth.activeEmpresaId,
      mustChangePassword: auth.mustChangePassword,
      pendingEmpresaId: auth.pendingEmpresaId,
      refreshEmpresas: auth.refreshEmpresas,
      setActiveEmpresa: auth.setActiveEmpresa,
      signOut: auth.signOut,

      subscription: subscription.subscription,
      loadingSubscription: subscription.loadingSubscription,
      refetchSubscription: subscription.refetchSubscription,

      empresaRole: empresaRoleQuery.data,
      empresaRoleLoading: !empresaRoleQuery.isFetched,
      isAdminLike,
    };
  }, [
    auth.session,
    auth.userId,
    auth.loading,
    auth.empresas,
    auth.activeEmpresa,
    auth.activeEmpresaId,
    auth.mustChangePassword,
    auth.pendingEmpresaId,
    auth.refreshEmpresas,
    auth.setActiveEmpresa,
    auth.signOut,
    subscription.subscription,
    subscription.loadingSubscription,
    subscription.refetchSubscription,
    empresaRoleQuery.data,
    empresaRoleQuery.isFetched,
    isAdminLike,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContextProvider');
  return ctx;
}

