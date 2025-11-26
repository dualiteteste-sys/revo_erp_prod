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
  const [loading, setLoading] = useState(true);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [activeEmpresaId, setActiveEmpresaId] = useState<string | null>(null);

  const bootRef = useRef(false);

  const activeEmpresa = useMemo(() => {
    return empresas.find((e) => e.id === activeEmpresaId) || null;
  }, [empresas, activeEmpresaId]);

  // ===== Helpers =====

  const getSession = useCallback(async () => {
    // console.log("[AUTH] getSession:init");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("[AUTH] getSession:error", error);
      return null;
    }
    // console.log("[AUTH] getSession:done", data);
    return data.session ?? null;
  }, [supabase]);

  const ensureBootstrapEmpresa = useCallback(
    async () => {
      // Garante criação/ativação de empresa para o usuário atual (idempotente)
      try {
        console.log("[AUTH][EMPRESAS] bootstrap:start");
        // @ts-ignore - RPC types mismatch
        const { error } = await supabase.rpc("secure_bootstrap_empresa_for_current_user", {
          p_razao_social: "Empresa sem Nome",
          p_fantasia: null,
        });
        if (error) {
          // Erros de contexto anônimo, RLS brandas, etc: loga e segue.
          console.warn("[AUTH][EMPRESAS][WARN] bootstrap rpc error", error);
        } else {
          console.log("[AUTH][EMPRESAS] bootstrap:ok");
        }
      } catch (e) {
        console.warn("[AUTH][EMPRESAS][WARN] bootstrap exception", e);
      }
    },
    [supabase]
  );

  const loadEmpresas = useCallback(
    async () => {
      // 1) tenta pegar a empresa ativa persistida
      const uae = await supabase
        .from("user_active_empresa")
        .select("empresa_id")
        .single();
      if (!uae.error && uae.data?.empresa_id) {
        // @ts-ignore - Table types missing
        setActiveEmpresaId(uae.data.empresa_id);
      } else {
        setActiveEmpresaId(null);
      }

      // 2) lista memberships do usuário (RLS deve permitir por user_id)
      // DUALITE ADAPTATION: Fetching full company objects via join to support UI components
      const eu = await supabase
        .from("empresa_usuarios")
        .select("empresa:empresas(*)")
        .order("created_at", { ascending: false });

      if (eu.error) {
        console.warn("[AUTH][EMPRESAS][WARN] list empresas", eu.error);
        setEmpresas([]);
        return;
      }

      const loadedEmpresas = (eu.data ?? [])
        .map((r: any) => r.empresa)
        .filter((e: any) => e !== null) as Empresa[];

      setEmpresas(loadedEmpresas);

      console.log("[AUTH][EMPRESAS] fetch:ok", {
        count: loadedEmpresas.length,
        // @ts-ignore - Table types missing
        activeEmpresaId: uae.data?.empresa_id ?? null,
      });
    },
    [supabase]
  );

  const refreshEmpresas = useCallback(
    async () => {
      if (!userId) return;
      setLoading(true);

      // Primeira leitura
      await loadEmpresas();

      // Se não há nenhuma, tenta bootstrap e recarrega
      // Note: We check activeEmpresaId as a proxy for "has access to a company"
      // but we should also check if the list is empty to trigger bootstrap for new users
      if (!activeEmpresaId) {
        await ensureBootstrapEmpresa();
        await loadEmpresas();
      }

      setLoading(false);
    },
    [userId, activeEmpresaId, ensureBootstrapEmpresa, loadEmpresas]
  );

  const setActiveEmpresa = async (empresa: Empresa) => {
    if (!userId) return;
    try {
      // Optimistic update
      setActiveEmpresaId(empresa.id);

      // @ts-ignore - RPC types mismatch
      const { error } = await supabase.rpc('set_active_empresa_for_current_user', {
        p_empresa_id: empresa.id
      });

      if (error) {
        console.error("[AUTH] Failed to set active company", error);
      }
    } catch (e) {
      console.error("[AUTH] Exception setting active company", e);
    }
  };

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserId(null);
    setEmpresas([]);
    setActiveEmpresaId(null);
    bootRef.current = false; // Garante que o próximo login dispare o bootstrap novamente
  }, [supabase]);

  // ===== Effects =====

  // Inicializa sessão
  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      setUserId(s?.user?.id ?? null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observa mudanças de auth
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      // console.log("[AUTH] onAuthStateChange", { event, hasSession: !!sess });
      setSession(sess ?? null);
      setUserId(sess?.user?.id ?? null);

      // Reset bootRef on explicit sign out event to be safe
      if (event === 'SIGNED_OUT') {
        bootRef.current = false;
        setEmpresas([]);
        setActiveEmpresaId(null);
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
      console.log("[AUTH][LOGIN] start", { email: session?.user ? "exists" : "anonymous" });
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
      activeEmpresaId,
      refreshEmpresas,
      setActiveEmpresa,
      signOut,
    }),
    [session, userId, loading, empresas, activeEmpresa, activeEmpresaId, refreshEmpresas, setActiveEmpresa, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
