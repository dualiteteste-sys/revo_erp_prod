import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useToast } from '@/contexts/ToastProvider';

import type { OnboardingCheck } from './onboardingChecks';
import ContaCorrenteFormPanel from '@/components/financeiro/tesouraria/ContaCorrenteFormPanel';
import CentrosDeCustoFormPanel from '@/components/financeiro/centros-de-custo/CentrosDeCustoFormPanel';
import type { ContaCorrente } from '@/services/treasury';
import { setContaCorrentePadrao } from '@/services/treasury';
import type { CentroDeCusto } from '@/services/centrosDeCusto';
import CompanySettingsForm from '@/components/settings/company/CompanySettingsForm';
import NfeSettingsPage from '@/pages/fiscal/NfeSettingsPage';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  empresaId: string;
  step: OnboardingCheck;
  onDone: () => Promise<void> | void;
};

export function isEmbeddedOnboardingStep(stepKey: string) {
  return (
    stepKey === 'empresa.perfil_basico' ||
    stepKey === 'tesouraria.contas_correntes' ||
    stepKey === 'tesouraria.padrao_recebimentos' ||
    stepKey === 'tesouraria.padrao_pagamentos' ||
    stepKey === 'financeiro.centros_de_custo' ||
    stepKey === 'fiscal.nfe.emitente' ||
    stepKey === 'fiscal.nfe.numeracao'
  );
}

export default function OnboardingStepModal({ isOpen, onClose, empresaId, step, onDone }: Props) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const [contas, setContas] = useState<ContaCorrente[]>([]);
  const [selectedContaId, setSelectedContaId] = useState<string | null>(null);
  const selectedConta = useMemo(() => contas.find((c) => c.id === selectedContaId) ?? null, [contas, selectedContaId]);

  const loadContas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('financeiro_contas_correntes_list', {
        p_q: null,
        p_ativo: true,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContaCorrente[];
      setContas(rows);
      setSelectedContaId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar contas correntes.', 'error');
      setContas([]);
      setSelectedContaId(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, supabase]);

  useEffect(() => {
    if (!isOpen) return;
    if (step.key === 'tesouraria.padrao_recebimentos' || step.key === 'tesouraria.padrao_pagamentos') {
      void loadContas();
    }
  }, [isOpen, loadContas, step.key]);

  const handleSetPadrao = async (para: 'pagamentos' | 'recebimentos') => {
    if (!selectedConta) {
      addToast('Crie uma conta corrente primeiro.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await setContaCorrentePadrao({ id: selectedConta.id, para, value: true });
      addToast('Conta padrão definida!', 'success');
      await onDone();
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao definir conta padrão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (step.key === 'tesouraria.contas_correntes') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Tesouraria — Criar Conta Corrente" size="6xl" overlayClassName="z-50">
        <ContaCorrenteFormPanel
          conta={null}
          onClose={onClose}
          onSaveSuccess={async () => {
            await onDone();
            onClose();
          }}
        />
      </Modal>
    );
  }

  if (step.key === 'tesouraria.padrao_recebimentos' || step.key === 'tesouraria.padrao_pagamentos') {
    const para = step.key === 'tesouraria.padrao_pagamentos' ? 'pagamentos' : 'recebimentos';
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Tesouraria — Definir conta padrão (${para})`}
        size="3xl"
        overlayClassName="z-50"
      >
        <div className="p-6">
          <p className="text-sm text-gray-600">
            Selecione qual conta será usada como padrão ao registrar {para === 'pagamentos' ? 'pagamentos' : 'recebimentos'}.
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            {loading ? (
              <div className="py-8 flex items-center justify-center text-gray-600">
                <Loader2 className="animate-spin mr-2" size={18} />
                Carregando…
              </div>
            ) : contas.length === 0 ? (
              <div className="text-sm text-gray-700">
                Nenhuma conta encontrada. Primeiro crie uma conta corrente no passo “Contas Correntes”.
              </div>
            ) : (
              <div className="space-y-2">
                {contas.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      name="conta"
                      checked={selectedContaId === c.id}
                      onChange={() => setSelectedContaId(c.id)}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{c.nome}</div>
                      <div className="text-xs text-gray-600 truncate">
                        {c.tipo_conta}
                        {c.padrao_para_pagamentos ? ' • padrão pagamentos' : ''}
                        {c.padrao_para_recebimentos ? ' • padrão recebimentos' : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button onClick={() => void handleSetPadrao(para)} disabled={loading || !selectedConta}>
              {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
              Definir como padrão
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step.key === 'financeiro.centros_de_custo') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Financeiro — Criar Centro de Custo" size="6xl" overlayClassName="z-50">
        <CentrosDeCustoFormPanel
          centro={null}
          onClose={onClose}
          onSaveSuccess={async (_saved: CentroDeCusto) => {
            await onDone();
            onClose();
          }}
        />
      </Modal>
    );
  }

  if (step.key === 'empresa.perfil_basico') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Empresa — Dados básicos" size="7xl" overlayClassName="z-50">
        <div className="p-6">
          <CompanySettingsForm
            onSaved={async () => {
              await onDone();
              onClose();
            }}
          />
        </div>
      </Modal>
    );
  }

  if (step.key === 'fiscal.nfe.emitente' || step.key === 'fiscal.nfe.numeracao') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Fiscal — NF-e (Configurações)" size="7xl" overlayClassName="z-50">
        <div className="p-6">
          <NfeSettingsPage
            onEmitenteSaved={async () => {
              await onDone();
              onClose();
            }}
            onNumeracaoSaved={async () => {
              await onDone();
              onClose();
            }}
          />
        </div>
      </Modal>
    );
  }

  return null;
}
