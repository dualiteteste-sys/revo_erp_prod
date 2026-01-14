import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase(); // SupabaseClient único da app
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
      await setActiveMutation.mutateAsync(empresa.id);
    } catch (e) {
      // Logger handled in mutation
    }
  };

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserId(null);
    // React Query cache clearing is handled by the query client, 
    // but we can manually reset if needed.
    // For now, just resetting local state refs.
    bootRef.current = false;
  }, [supabase]);

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

      // Reset bootRef on explicit sign out event to be safe
      if (event === 'SIGNED_OUT') {
        bootRef.current = false;
        setMustChangePassword(false);
        setPendingEmpresaId(null);
        // setEmpresas([]); // Handled by query key change (userId becomes null)
        // setActiveEmpresaId(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, refreshUserFlags]);

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
