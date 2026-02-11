import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/providers/SupabaseProvider";
import { Database } from "@/types/database.types";
import { logger } from "@/lib/logger";
import { useEmpresas, useActiveEmpresaId, useBootstrapEmpresa, useSetActiveEmpresa } from "@/hooks/useEmpresas";
import * as Sentry from "@sentry/react";

type Empresa = Database['public']['Tables']['empresas']['Row'];

type Session =
  | {
    user: { id: string } | null;
    access_token?: string | null;
  }
  | null;

type AuthContextType = {
  session: Session;
  userId: string | null;
  loading: boolean;
  empresas: Empresa[];
  activeEmpresa: Empresa | null;
  activeEmpresaId: string | null;
  mustChangePassword: boolean;
  pendingEmpresaId: string | null;
  refreshEmpresas: () => Promise<void>;
  setActiveEmpresa: (empresa: Empresa) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_TEST_ENV =
  import.meta.env.MODE === "test" ||
  import.meta.env.VITEST === "true" ||
  (typeof process !== "undefined" && Boolean((process as any).env?.VITEST));

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function clearLocalAppStorageBestEffort() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.clear();
  } catch {
    // best-effort
  }
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith("sb-") || k.startsWith("revo_") || k.startsWith("revoops_")) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // best-effort
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase(); // SupabaseClient único da app
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingEmpresaId, setPendingEmpresaId] = useState<string | null>(null);
  const { data: empresas = [], refetch: refetchEmpresas, isLoading: isLoadingEmpresas } = useEmpresas(userId);
  const { data: activeEmpresaId, refetch: refetchActiveId, isLoading: isLoadingActiveId } = useActiveEmpresaId(userId);

  const bootstrapMutation = useBootstrapEmpresa();
  const setActiveMutation = useSetActiveEmpresa();

  const [authLoading, setAuthLoading] = useState(true);

  const loading = authLoading || isLoadingEmpresas || isLoadingActiveId;


  const bootRef = useRef(false);
  const resetRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);
  const prevActiveEmpresaIdRef = useRef<string | null>(null);

  const activeEmpresa = useMemo(() => {
    const found = empresas.find((e) => e.id === activeEmpresaId) || null;
    if ((import.meta as any).env?.DEV && (window as any).__REVO_DEBUG_AUTH === true) {
      console.log("[AuthProvider] activeEmpresa calc:", {
        empresasCount: empresas.length,
        activeEmpresaId,
        foundId: found?.id,
      });
    }
    return found;
  }, [empresas, activeEmpresaId]);

  const clearRuntimeStateBestEffort = useCallback(
    (reason: string) => {
      if (resetRef.current) return;
      resetRef.current = true;
      try {
        logger.warn("[AUTH][RESET] clearing runtime state", { reason });
      } catch {
        // noop
      }

      try {
        queryClient.cancelQueries();
        (queryClient as any).cancelMutations?.();
      } catch {
        // best-effort
      }
      try {
        queryClient.getQueryCache().clear();
        queryClient.getMutationCache().clear();
        queryClient.clear();
      } catch {
        // best-effort
      }

      clearLocalAppStorageBestEffort();

      // Ensure internal bootstraps don't reuse stale state.
      bootRef.current = false;

      // Reset local state (defensive).
      setSession(null);
      setUserId(null);
      setMustChangePassword(false);
      setPendingEmpresaId(null);

      // Kill any remaining singleton/runtime state by forcing a full navigation (PROD only).
      if (!IS_TEST_ENV && typeof window !== "undefined") {
        try {
          window.location.replace("/auth/login");
        } catch {
          // noop
        }
      }
    },
    [queryClient],
  );

  useEffect(() => {
    try {
      Sentry.setUser(userId ? { id: userId } : null);
    } catch {
      // noop
    }
  }, [userId]);

  useEffect(() => {
    try {
      if (activeEmpresaId) Sentry.setTag("empresa_id", activeEmpresaId);
    } catch {
      // noop
    }
  }, [activeEmpresaId]);

  useEffect(() => {
    try {
      if (activeEmpresa) {
        Sentry.setContext("empresa", {
          id: activeEmpresa.id,
          nome: (activeEmpresa as any)?.nome ?? null,
          razao_social: (activeEmpresa as any)?.razao_social ?? null,
        });
      }
    } catch {
      // noop
    }
  }, [activeEmpresa]);

  // ===== Helpers =====

  const getSession = useCallback(async () => {
    // console.log("[AUTH] getSession:init");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      logger.warn("[AUTH] getSession:error", { error });
      return null;
    }
    // console.log("[AUTH] getSession:done", data);
    return data.session ?? null;
  }, [supabase]);

  const refreshUserFlags = useCallback(
    async (nextUserId: string | null) => {
      if (!nextUserId) {
        setMustChangePassword(false);
        setPendingEmpresaId(null);
        return;
      }
      try {
        const { data } = await supabase.auth.getUser();
        const meta: any = (data?.user as any)?.user_metadata ?? {};
        setMustChangePassword(!!meta.must_change_password);
        setPendingEmpresaId(typeof meta.pending_empresa_id === "string" ? meta.pending_empresa_id : null);
      } catch {
        // best-effort: não bloquear auth por metadata
        setMustChangePassword(false);
        setPendingEmpresaId(null);
      }
    },
    [supabase],
  );

  const refreshEmpresas = useCallback(
    async () => {
      if (!userId) return;

      // Force refetch both
      const [empresasResult, activeResult] = await Promise.all([
        refetchEmpresas(),
        refetchActiveId()
      ]);

      const currentEmpresas = empresasResult.data || [];
      const currentActiveId = activeResult.data;

      // Se não há nenhuma, tenta bootstrap e recarrega
      if (currentEmpresas.length === 0 && !currentActiveId) {
        try {
          await bootstrapMutation.mutateAsync();
          // Invalidation happens automatically in mutation onSuccess, 
          // but we might want to wait or refetch manually to update local state immediately if needed
          await Promise.all([refetchEmpresas(), refetchActiveId()]);
        } catch (e) {
          // Logger already handled in mutation
        }
      }
    },
    [userId, refetchEmpresas, refetchActiveId, bootstrapMutation]
  );

  const setActiveEmpresa = async (empresa: Empresa) => {
    if (!userId) return;
    try {
      // [FIX] Update storage immediately for faster feedback and next-request correctness
      if (typeof window !== "undefined") {
        sessionStorage.setItem("revo_active_empresa_id", empresa.id);
      }
      await setActiveMutation.mutateAsync(empresa.id);
    } catch (e) {
      // Logger handled in mutation
    }
  };

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      clearRuntimeStateBestEffort("explicit_sign_out");
    }
  }, [supabase, clearRuntimeStateBestEffort]);

  // ===== Effects =====

  // Inicializa sessão
  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      const uid = s?.user?.id ?? null;
      setUserId(uid);
      await refreshUserFlags(uid);
      setAuthLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observa mudanças de auth
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess ?? null);
      const uid = sess?.user?.id ?? null;
      setUserId(uid);
      void refreshUserFlags(uid);

      const prevUid = prevUserIdRef.current;
      prevUserIdRef.current = uid;

      // If user changes within the same runtime (multiple logins in the same browser tab),
      // hard-reset caches to avoid cross-tenant/user stale data rendering.
      if (event === "SIGNED_IN" && prevUid && prevUid !== uid) {
        clearRuntimeStateBestEffort("user_changed_signed_in");
      }

      // Reset bootRef on explicit sign out event to be safe
      if (event === 'SIGNED_OUT') {
        clearRuntimeStateBestEffort("auth_event_signed_out");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, refreshUserFlags, clearRuntimeStateBestEffort]);

  // Sync activeEmpresaId to sessionStorage for Header Injection (Tenant Leak fix)
  useEffect(() => {
    if (typeof window !== "undefined" && activeEmpresaId) {
      sessionStorage.setItem("revo_active_empresa_id", activeEmpresaId);
    }
  }, [activeEmpresaId]);

  // Tenant switch must be treated as a security boundary:
  // never allow cached data from tenant A to render while tenant B is active.
  useEffect(() => {
    const prev = prevActiveEmpresaIdRef.current;
    prevActiveEmpresaIdRef.current = activeEmpresaId ?? null;
    if (!prev || !activeEmpresaId) return;
    if (prev === activeEmpresaId) return;

    try {
      logger.warn("[AUTH][TENANT_SWITCH] clearing react-query cache", { from: prev, to: activeEmpresaId });
    } catch {
      // noop
    }
    try {
      queryClient.cancelQueries();
      queryClient.getQueryCache().clear();
      queryClient.getMutationCache().clear();
      queryClient.clear();
    } catch {
      // best-effort
    }
  }, [activeEmpresaId, queryClient]);

  // Bootstrap + carga de empresas no primeiro login
  useEffect(() => {
    if (!userId) return;
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      logger.info("[AUTH][LOGIN] start", { email: session?.user ? "exists" : "anonymous" });
      await refreshEmpresas();
      // Se ainda assim não há empresa ativa, o consumidor (AppShell) decide exibir modal de erro
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      userId,
      loading,
      empresas,
      activeEmpresa,
      activeEmpresaId: activeEmpresaId ?? null,
      mustChangePassword,
      pendingEmpresaId,
      refreshEmpresas,
      setActiveEmpresa,
      signOut,
    }),
    [
      session,
      userId,
      loading,
      empresas,
      activeEmpresa,
      activeEmpresaId,
      mustChangePassword,
      pendingEmpresaId,
      refreshEmpresas,
      setActiveEmpresa,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
