import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';
import { listContasCorrentes, type ContaCorrente } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';

type EstornoRecebimentoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  defaultDateISO?: string;
  defaultContaTipo?: 'recebimentos' | 'pagamentos';
  confirmLabel: string;
  onConfirm: (params: { contaCorrenteId: string | null; dataISO: string; motivo: string }) => Promise<void>;
};

export default function EstornoRecebimentoModal({
  isOpen,
  onClose,
  title,
  description,
  defaultDateISO,
  defaultContaTipo = 'recebimentos',
  confirmLabel,
  onConfirm,
}: EstornoRecebimentoModalProps) {
  const { addToast } = useToast();
  const [isLoadingContas, setIsLoadingContas] = useState(false);
  const [contas, setContas] = useState<ContaCorrente[]>([]);
  const [contaId, setContaId] = useState<string>('');
  const [dataISO, setDataISO] = useState<string>(defaultDateISO || new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDataISO(defaultDateISO || new Date().toISOString().slice(0, 10));
    setMotivo('');
  }, [defaultDateISO, isOpen]);

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
          defaultContaTipo === 'pagamentos'
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
  }, [addToast, defaultContaTipo, isOpen]);

  const canSubmit = useMemo(() => {
    return !!dataISO && !isLoadingContas && !isSubmitting;
  }, [dataISO, isLoadingContas, isSubmitting]);

  const handleConfirm = async () => {
    if (!dataISO) {
      addToast('Informe uma data válida.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm({ contaCorrenteId: contaId || null, dataISO, motivo });
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
            label="Data do estorno"
            name="estorno_data"
            type="date"
            value={dataISO}
            onChange={(e) => setDataISO(e.target.value)}
            className="md:col-span-2"
          />

          <div className="md:col-span-4">
            <Select
              label="Conta Corrente (opcional)"
              name="estorno_conta"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              disabled={isLoadingContas}
            >
              <option value="">(Usar padrão)</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.padrao_para_recebimentos ? ' • padrão recebimentos' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <TextArea
          label="Motivo (opcional)"
          name="estorno_motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Descreva o motivo do estorno..."
        />

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
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
