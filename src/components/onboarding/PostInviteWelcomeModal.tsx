import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Sparkles, Users, CreditCard, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useOnboardingGate } from '@/contexts/OnboardingGateContext';
import { useSupabase } from '@/providers/SupabaseProvider';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type OnboardingCheck = {
  key: string;
  title: string;
  status: 'ok' | 'warn' | 'missing';
  description?: string;
};

type OnboardingRpcResult = {
  checks: OnboardingCheck[];
  progress?: { ok: number; total: number };
};

const STORAGE_KEY = 'revo:post_invite_welcome_shown';

export default function PostInviteWelcomeModal({ isOpen, onClose }: Props) {
  const { activeEmpresa } = useAuth();
  const supabase = useSupabase();
  const gate = useOnboardingGate();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<OnboardingCheck[]>([]);

  const empresaId = activeEmpresa?.id ?? null;
  const empresaNome = useMemo(
    () => activeEmpresa?.nome_fantasia ?? activeEmpresa?.nome_razao_social ?? 'sua empresa',
    [activeEmpresa],
  );

  const progress = useMemo(() => {
    const total = checks.length;
    const ok = checks.filter((c) => c.status === 'ok').length;
    return { ok, total };
  }, [checks]);

  const nextMissing = useMemo(() => checks.find((c) => c.status !== 'ok') ?? null, [checks]);

  const refresh = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('onboarding_checks_for_current_empresa');
      if (error) throw error;
      const res = (data ?? null) as unknown as OnboardingRpcResult | null;
      const list = Array.isArray(res?.checks) ? res!.checks : [];
      setChecks(list);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, supabase]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  const markShown = useCallback(() => {
    if (!empresaId) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      map[empresaId] = true;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }, [empresaId]);

  const handleClose = () => {
    markShown();
    onClose();
  };

  const handleOpenWizard = async () => {
    markShown();
    onClose();
    await gate.openWizard(nextMissing?.key ?? null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bem-vindo(a) à Ultria"
      size="3xl"
      glassClassName="bg-white/65"
    >
      <div className="p-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900 leading-tight">Você já tem acesso ao sistema.</div>
              <div className="mt-1 text-sm text-gray-600">
                Você foi convidado(a) para <span className="font-medium text-gray-800">{empresaNome}</span>. Para evitar surpresas,
                faça as configurações mínimas (sem travar) e comece a operar com confiança.
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-white/30 bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Configuração inicial (recomendado)</div>
                  <div className="mt-1 text-sm text-gray-600">
                    {loading || progress.total === 0 ? (
                      'Carregando…'
                    ) : progress.ok === progress.total ? (
                      <span className="inline-flex items-center gap-2 text-emerald-700">
                        <CheckCircle size={16} /> Tudo pronto.
                      </span>
                    ) : (
                      <>
                        Progresso: <span className="font-semibold text-gray-800">{progress.ok}</span> /{' '}
                        <span className="font-semibold text-gray-800">{progress.total}</span>.{' '}
                        {nextMissing ? (
                          <span className="text-gray-700">
                            Próximo passo: <span className="font-medium">{nextMissing.title}</span>.
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <Button className="gap-2" onClick={() => void handleOpenWizard()}>
                  Continuar <ArrowRight size={16} />
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/30 bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Sua assinatura e limites</div>
                  <div className="mt-1 text-sm text-gray-600">Veja plano, trial, uso de usuários e limite do mês.</div>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    markShown();
                    onClose();
                    navigate('/app?settings=billing');
                  }}
                >
                  <CreditCard size={16} />
                  Abrir
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/30 bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Convide sua equipe</div>
                  <div className="mt-1 text-sm text-gray-600">Convites com fluxo simples: e-mail → senha → entra direto.</div>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    markShown();
                    onClose();
                    navigate('/app?settings=users');
                  }}
                >
                  <Users size={16} />
                  Usuários
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <div className="text-xs text-gray-500">Você pode reabrir isso depois no menu Configurações.</div>
            <Button variant="ghost" onClick={handleClose}>
              Agora não
            </Button>
          </div>
        </motion.div>
      </div>
    </Modal>
  );
}
