import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import { CheckCheck, Loader2 } from 'lucide-react';
import { listContasCorrentes, type ContaCorrente } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type BaixaEmLoteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'pagar' | 'receber';
  selectedCount: number;
  totalSaldo: number | null;
  onConfirm: (params: { contaCorrenteId: string | null; dataISO: string }) => Promise<void>;
};

export default function BaixaEmLoteModal({
  isOpen,
  onClose,
  tipo,
  selectedCount,
  totalSaldo,
  onConfirm,
}: BaixaEmLoteModalProps) {
  const { addToast } = useToast();
  const [isLoadingContas, setIsLoadingContas] = useState(false);
  const [contas, setContas] = useState<ContaCorrente[]>([]);
  const [contaId, setContaId] = useState<string>('');
  const [dataISO, setDataISO] = useState<string>(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDataISO(new Date().toISOString().slice(0, 10));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setIsLoadingContas(true);
      try {
        const result = await listContasCorrentes({ page: 1, pageSize: 200, searchTerm: '', ativo: true });
        if (cancelled) return;
        const list = result.data ?? [];
        setContas(list);

        const preferred =
          tipo === 'pagar'
            ? list.find((c) => c.padrao_para_pagamentos) || list[0] || null
            : list.find((c) => c.padrao_para_recebimentos) || list[0] || null;
        setContaId(preferred?.id || '');
      } catch (e: any) {
        if (!cancelled) addToast(e?.message || 'Erro ao carregar contas correntes.', 'error');
      } finally {
        if (!cancelled) setIsLoadingContas(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast, isOpen, tipo]);

  const canSubmit = useMemo(
    () => !!dataISO && !isLoadingContas && !isSubmitting && selectedCount > 0,
    [dataISO, isLoadingContas, isSubmitting, selectedCount],
  );

  const handleConfirm = async () => {
    if (!dataISO) {
      addToast('Informe a data de pagamento.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({ contaCorrenteId: contaId || null, dataISO });
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelTipo = tipo === 'pagar' ? 'pagar' : 'receber';
  const verb = tipo === 'pagar' ? 'Pagar' : 'Receber';
  const pastParticiple = tipo === 'pagar' ? 'pagas' : 'recebidas';
  const title = `${verb} ${selectedCount} conta${selectedCount !== 1 ? 's' : ''} selecionada${selectedCount !== 1 ? 's' : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="2xl">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total a {labelTipo}
            </p>
            <p className="mt-0.5 text-2xl font-bold text-slate-800">
              {totalSaldo !== null ? brlFormatter.format(totalSaldo) : '—'}
            </p>
          </div>
          <p className="max-w-[200px] text-right text-xs text-slate-500 leading-relaxed">
            Cada conta é liquidada pelo saldo pendente. Contas já {pastParticiple} são ignoradas automaticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <Input
            label="Data de pagamento"
            name="baixa_lote_data"
            type="date"
            value={dataISO}
            onChange={(e) => setDataISO(e.target.value)}
            className="md:col-span-3"
          />

          <div className="md:col-span-3">
            <Select
              label="Conta Corrente"
              name="baixa_lote_conta"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              disabled={isLoadingContas}
            >
              <option value="">(Usar padrão)</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.padrao_para_pagamentos && tipo === 'pagar' ? ' • padrão pagamentos' : ''}
                  {c.padrao_para_recebimentos && tipo === 'receber' ? ' • padrão recebimentos' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isLoadingContas ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="animate-spin" size={16} />
            Carregando contas correntes...
          </div>
        ) : contas.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Nenhuma conta corrente encontrada. Ao confirmar, o sistema tentará criar/reativar
            automaticamente um <span className="font-medium">Caixa</span>.
          </div>
        ) : null}
      </div>

      <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} disabled={!canSubmit} className="gap-2">
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
          Confirmar baixa
        </Button>
      </div>
    </Modal>
  );
}
