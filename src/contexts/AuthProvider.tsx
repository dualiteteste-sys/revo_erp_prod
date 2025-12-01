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
  const { data: empresas = [], refetch: refetchEmpresas, isLoading: isLoadingEmpresas } = useEmpresas(userId);
  const { data: activeEmpresaId, refetch: refetchActiveId, isLoading: isLoadingActiveId } = useActiveEmpresaId(userId);

  const bootstrapMutation = useBootstrapEmpresa();
  const setActiveMutation = useSetActiveEmpresa();

  const loading = isLoadingEmpresas || isLoadingActiveId;


  const bootRef = useRef(false);

  const activeEmpresa = useMemo(() => {
    return empresas.find((e) => e.id === activeEmpresaId) || null;
  }, [empresas, activeEmpresaId]);

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
      setUserId(s?.user?.id ?? null);
      // Loading is now derived from queries
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observa mudanças de auth
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess ?? null);
      setUserId(sess?.user?.id ?? null);

      // Reset bootRef on explicit sign out event to be safe
      if (event === 'SIGNED_OUT') {
        bootRef.current = false;
        // setEmpresas([]); // Handled by query key change (userId becomes null)
        // setActiveEmpresaId(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

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
      refreshEmpresas,
      setActiveEmpresa,
      signOut,
    }),
    [session, userId, loading, empresas, activeEmpresa, activeEmpresaId, refreshEmpresas, setActiveEmpresa, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
