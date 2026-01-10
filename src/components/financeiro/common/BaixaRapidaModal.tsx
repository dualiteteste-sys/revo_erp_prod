import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet } from 'lucide-react';
import { listContasCorrentes, type ContaCorrente } from '@/services/treasury';
import { useNumericField } from '@/hooks/useNumericField';
import { useToast } from '@/contexts/ToastProvider';

type BaixaRapidaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  defaultValor: number;
  defaultDateISO?: string; // YYYY-MM-DD
  confirmLabel: string;
  onConfirm: (params: { contaCorrenteId: string | null; dataISO: string; valor: number }) => Promise<void>;
};

export default function BaixaRapidaModal({
  isOpen,
  onClose,
  title,
  description,
  defaultValor,
  defaultDateISO,
  confirmLabel,
  onConfirm,
}: BaixaRapidaModalProps) {
  const { addToast } = useToast();
  const [isLoadingContas, setIsLoadingContas] = useState(false);
  const [contas, setContas] = useState<ContaCorrente[]>([]);
  const [contaId, setContaId] = useState<string>('');
  const [dataISO, setDataISO] = useState<string>(defaultDateISO || new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [valor, setValor] = useState<number>(defaultValor || 0);
  const valorProps = useNumericField(valor, setValor);

  useEffect(() => {
    if (!isOpen) return;
    setDataISO(defaultDateISO || new Date().toISOString().slice(0, 10));
    setValor(defaultValor || 0);
  }, [defaultDateISO, defaultValor, isOpen]);

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
          list.find((c) => c.padrao_para_recebimentos || c.padrao_para_pagamentos) ||
          list[0] ||
          null;
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
  }, [addToast, isOpen]);

  const canSubmit = useMemo(() => {
    return !!dataISO && Number(valor) > 0 && !isLoadingContas && !isSubmitting;
  }, [dataISO, isLoadingContas, isSubmitting, valor]);

  const handleConfirm = async () => {
    if (!dataISO || !(Number(valor) > 0)) {
      addToast('Informe data e valor válidos.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({ contaCorrenteId: contaId || null, dataISO, valor: Number(valor) });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="2xl">
      <div className="p-6 space-y-4">
        {description ? <div className="text-sm text-gray-600">{description}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <Input
            label="Data"
            name="baixa_data"
            type="date"
            value={dataISO}
            onChange={(e) => setDataISO(e.target.value)}
            className="md:col-span-2"
          />

          <Input
            label="Valor"
            name="baixa_valor"
            startAdornment="R$"
            inputMode="numeric"
            {...valorProps}
            className="md:col-span-2"
          />

          <div className="md:col-span-2">
            <Select
              label="Conta Corrente"
              name="baixa_conta"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              disabled={isLoadingContas}
            >
              <option value="">(Usar padrão)</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.padrao_para_pagamentos ? ' • padrão pagamentos' : ''}
                  {c.padrao_para_recebimentos ? ' • padrão recebimentos' : ''}
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
            Nenhuma conta corrente encontrada. Ao confirmar, o sistema tentará criar/reativar automaticamente um <span className="font-medium">Caixa</span>.
          </div>
        ) : null}
      </div>

      <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} disabled={!canSubmit} className="gap-2">
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Wallet size={16} />}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
