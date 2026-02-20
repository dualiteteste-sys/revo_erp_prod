import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import GlassCard from '../ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Building2, RefreshCcw } from 'lucide-react';
import TermsAcceptanceGate from '@/components/auth/TermsAcceptanceGate';

const FullscreenLoading = ({ label }: { label?: string }) => (
  <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 border-4 border-blue-500 border-dashed rounded-full animate-spin" />
      <div className="text-sm text-slate-600">{label ?? 'Carregando…'}</div>
    </div>
  </div>
);

const SelectEmpresaGate = ({
  empresas,
  onSelect,
  onReload,
}: {
  empresas: { id: string; nome_fantasia?: string | null; nome_razao_social?: string | null }[];
  onSelect: (empresaId: string) => void;
  onReload: () => void;
}) => {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <GlassCard className="w-full max-w-xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Selecione sua empresa</h2>
            <p className="text-sm text-slate-600 mt-1">
              Para manter o isolamento multi-tenant, precisamos definir a empresa ativa antes de abrir o sistema.
            </p>
          </div>
          <Button variant="ghost" className="gap-2" onClick={onReload}>
            <RefreshCcw size={16} />
            Recarregar
          </Button>
        </div>

        <div className="mt-5 grid gap-2">
          {empresas.map((e) => (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-white/20 bg-white/40 hover:bg-white/60 transition-colors px-4 py-3 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Building2 className="text-slate-600" size={18} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">
                  {e.nome_fantasia || e.nome_razao_social || 'Empresa'}
                </div>
                <div className="text-xs text-slate-600">Definir como empresa ativa</div>
              </div>
            </button>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { session, userId, loading, mustChangePassword, pendingEmpresaId, empresas, activeEmpresaId, setActiveEmpresa, refreshEmpresas, signOut } =
    useAuth();
  const location = useLocation();
  const [autoSelectAttempted, setAutoSelectAttempted] = useState(false);

  if (loading) {
    return <FullscreenLoading label="Carregando ambiente…" />;
  }

  if (!session) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (mustChangePassword) {
    const qs = pendingEmpresaId ? `?empresa_id=${encodeURIComponent(pendingEmpresaId)}` : "";
    return <Navigate to={`/auth/force-change-password${qs}`} replace />;
  }

  // AuthGate: só renderiza a app quando houver empresa ativa.
  if (!activeEmpresaId) {
    // 1) Se o usuário tem exatamente 1 empresa, auto-seleciona (best-effort).
    if (empresas.length === 1 && !autoSelectAttempted) {
      return (
        <AutoSelectEmpresa
          empresaId={empresas[0].id}
          onDone={() => setAutoSelectAttempted(true)}
          setActive={async () => setActiveEmpresa(empresas[0])}
        />
      );
    }

    // 2) Se não há empresas carregadas, tenta recarregar/bootstrapping.
    if (empresas.length === 0) {
      return (
        <FullscreenLoading label="Preparando sua empresa… (se persistir, recarregue)" />
      );
    }

    // 3) Multi-empresa: exigir seleção explícita (evita 403 intermitente).
    return (
      <SelectEmpresaGate
        empresas={empresas as any}
        onReload={() => {
          setAutoSelectAttempted(false);
          void refreshEmpresas();
        }}
        onSelect={(empresaId) => {
          const empresa = empresas.find((e) => e.id === empresaId);
          if (empresa) void setActiveEmpresa(empresa);
        }}
      />
    );
  }

  const effectiveUserId = userId ?? session.user?.id ?? null;
  if (!effectiveUserId) {
    return <FullscreenLoading label="Carregando usuário…" />;
  }

  return (
    <TermsAcceptanceGate userId={effectiveUserId} empresaId={activeEmpresaId} onDecline={signOut}>
      {children}
    </TermsAcceptanceGate>
  );
};

const AutoSelectEmpresa = ({
  empresaId,
  setActive,
  onDone,
}: {
  empresaId: string;
  setActive: () => Promise<void>;
  onDone: () => void;
}) => {
  useEffect(() => {
    // Mantém o efeito estável mesmo se callbacks mudarem de identidade por re-render.
  }, []);

  const setActiveRef = useRef(setActive);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    setActiveRef.current = setActive;
  }, [setActive]);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await setActiveRef.current();
      } finally {
        if (mounted) onDoneRef.current();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [empresaId]);

  return <FullscreenLoading label="Definindo empresa ativa…" />;
};

export default ProtectedRoute;
