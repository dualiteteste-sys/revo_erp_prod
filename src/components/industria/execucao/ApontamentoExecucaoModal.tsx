import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { Loader2 } from 'lucide-react';
import { Operacao, StatusOperacao, apontarExecucao } from '@/services/industriaExecucao';
import { useToast } from '@/contexts/ToastProvider';

type ApontamentoAction = 'pausar' | 'concluir';

export default function ApontamentoExecucaoModal({
  open,
  onClose,
  operacao,
  action,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  operacao: Operacao | null;
  action: ApontamentoAction;
  onSuccess: () => void;
}) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [qtdBoas, setQtdBoas] = useState<number>(0);
  const [qtdRefugadas, setQtdRefugadas] = useState<number>(0);
  const [motivoRefugo, setMotivoRefugo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const title = useMemo(() => {
    const base = action === 'pausar' ? 'Apontar parada' : 'Apontar conclusão';
    const op = operacao ? ` • OP #${operacao.ordem_numero} • ${operacao.centro_trabalho_nome}` : '';
    return `${base}${op}`;
  }, [action, operacao]);

  useEffect(() => {
    if (!open) return;
    setQtdBoas(0);
    setQtdRefugadas(0);
    setMotivoRefugo('');
    setObservacoes('');
  }, [open]);

  const handleConfirm = async () => {
    if (!operacao) return;
    setSaving(true);
    try {
      await apontarExecucao(
        operacao.id,
        action,
        Number.isFinite(qtdBoas) ? qtdBoas : 0,
        Number.isFinite(qtdRefugadas) ? qtdRefugadas : 0,
        (qtdRefugadas ?? 0) > 0 ? (motivoRefugo || null) : null,
        observacoes || null,
      );
      addToast(action === 'pausar' ? 'Operação pausada.' : 'Operação concluída.', 'success');
      onSuccess();
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao apontar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const status = (operacao?.status || 'planejada') as StatusOperacao;
  const isLocked = status === 'concluida' || status === 'cancelada';

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="md">
      <div className="p-6 space-y-4">
        {operacao && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
            <div className="font-semibold">{operacao.produto_nome}</div>
            <div className="text-xs text-slate-500">
              Status atual: <span className="font-semibold">{operacao.status.replace(/_/g, ' ')}</span>
            </div>
          </div>
        )}

        <Input
          label="Quantidade Boa"
          type="number"
          value={qtdBoas}
          onChange={(e) => setQtdBoas(Number(e.target.value) || 0)}
          disabled={saving || isLocked}
        />
        <Input
          label="Quantidade Refugada"
          type="number"
          value={qtdRefugadas}
          onChange={(e) => setQtdRefugadas(Number(e.target.value) || 0)}
          disabled={saving || isLocked}
        />
        {qtdRefugadas > 0 && (
          <Input
            label="Motivo do Refugo"
            value={motivoRefugo}
            onChange={(e) => setMotivoRefugo(e.target.value)}
            disabled={saving || isLocked}
          />
        )}
        <TextArea
          label="Observações"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          disabled={saving || isLocked}
        />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            disabled={saving || !operacao || isLocked}
            title={isLocked ? 'Operação concluída/cancelada não pode ser apontada.' : undefined}
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  );
}

