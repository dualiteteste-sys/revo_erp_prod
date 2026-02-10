import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import DecimalInput from '@/components/ui/forms/DecimalInput';
import { Loader2 } from 'lucide-react';
import { Operacao, StatusOperacao, apontarExecucao } from '@/services/industriaExecucao';
import { useToast } from '@/contexts/ToastProvider';
import { getMotivosRefugo } from '@/services/industriaProducao';
import QuickScanModal from '@/components/ui/QuickScanModal';
import { useAuth } from '@/contexts/AuthProvider';

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
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [saving, setSaving] = useState(false);
  const [qtdBoas, setQtdBoas] = useState<number>(0);
  const [qtdRefugadas, setQtdRefugadas] = useState<number>(0);
  const [motivoRefugo, setMotivoRefugo] = useState('');
  const [motivoRefugoId, setMotivoRefugoId] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [lote, setLote] = useState('');
  const [custoUnitario, setCustoUnitario] = useState<number>(0);
  const [motivos, setMotivos] = useState<Array<{ id: string; nome: string }>>([]);
  const [loadingMotivos, setLoadingMotivos] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const empresaRef = useRef<string | null>(activeEmpresaId);

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
    setMotivoRefugoId('');
    setObservacoes('');
    setLote('');
    setCustoUnitario(0);
  }, [open]);

  useEffect(() => {
    empresaRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  useEffect(() => {
    if (!open) return;
    if (action !== 'concluir') return;
    if (authLoading || !activeEmpresaId) return;
    const empresaSnapshot = activeEmpresaId;
    let cancelled = false;
    setLoadingMotivos(true);
    getMotivosRefugo()
      .then((rows) =>
        {
          if (cancelled || empresaSnapshot !== empresaRef.current) return;
          setMotivos(
          (rows || []).map((r: any) => ({
            id: r.id,
            nome: r.nome ?? r.descricao ?? r.titulo ?? String(r.id),
          })),
        );
        },
      )
      .catch(() => {
        if (cancelled || empresaSnapshot !== empresaRef.current) return;
        setMotivos([]);
      })
      .finally(() => {
        if (cancelled || empresaSnapshot !== empresaRef.current) return;
        setLoadingMotivos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, action, authLoading, activeEmpresaId]);

  const handleConfirm = async () => {
    if (!operacao) return;
    if (saving) return;
    if (authLoading || !activeEmpresaId) {
      addToast('Aguarde a troca de contexto (login/empresa) concluir para apontar.', 'info');
      return;
    }
    const empresaSnapshot = activeEmpresaId;
    setSaving(true);
    try {
      await apontarExecucao(
        operacao.id,
        action,
        Number.isFinite(qtdBoas) ? qtdBoas : 0,
        Number.isFinite(qtdRefugadas) ? qtdRefugadas : 0,
        (qtdRefugadas ?? 0) > 0 ? (motivoRefugo || undefined) : undefined,
        observacoes || undefined,
        {
          motivoRefugoId: (qtdRefugadas ?? 0) > 0 ? (motivoRefugoId || undefined) : undefined,
          lote: action === 'concluir' ? (lote || undefined) : undefined,
          custoUnitario: action === 'concluir' ? (custoUnitario > 0 ? custoUnitario : undefined) : undefined,
        },
      );
      if (empresaSnapshot !== empresaRef.current) return;
      addToast(action === 'pausar' ? 'Operação pausada.' : 'Operação concluída.', 'success');
      onSuccess();
      onClose();
    } catch (e: any) {
      if (empresaSnapshot !== empresaRef.current) return;
      addToast(e?.message || 'Falha ao apontar.', 'error');
    } finally {
      if (empresaSnapshot !== empresaRef.current) return;
      setSaving(false);
    }
  };

  const status = (operacao?.status || 'planejada') as StatusOperacao;
  const isLocked = status === 'concluida' || status === 'cancelada';

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="md">
      <QuickScanModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Escanear lote/etiqueta"
        helper="Use a câmera ou leitor para preencher o lote."
        onResult={(value: string) => {
          setLote(value);
          setScanOpen(false);
        }}
      />

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
          name="qtd_boas"
          type="number"
          value={qtdBoas}
          onChange={(e) => setQtdBoas(Number(e.target.value) || 0)}
          disabled={saving || isLocked}
        />
        <Input
          label="Quantidade Refugada"
          name="qtd_refugadas"
          type="number"
          value={qtdRefugadas}
          onChange={(e) => setQtdRefugadas(Number(e.target.value) || 0)}
          disabled={saving || isLocked}
        />
        {qtdRefugadas > 0 && (
          <div className="space-y-3">
            <Select
              label="Motivo do refugo (cadastro de Qualidade)"
              name="motivo_refugo_id"
              value={motivoRefugoId}
              onChange={(e) => setMotivoRefugoId(e.target.value)}
              disabled={saving || isLocked || loadingMotivos}
            >
              <option value="">Selecione (opcional)</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
            <Input
              label="Detalhes do refugo (opcional)"
              name="motivo_refugo"
              value={motivoRefugo}
              onChange={(e) => setMotivoRefugo(e.target.value)}
              disabled={saving || isLocked}
              placeholder="Ex.: dano na embalagem, risco, medida fora..."
            />
          </div>
        )}

        {action === 'concluir' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Lote do produto (opcional)"
                    name="lote"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    disabled={saving || isLocked}
                    placeholder="Ex.: LOTE-2026-001"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScanOpen(true)}
                  className="h-[44px] mt-6 px-3 border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  disabled={saving || isLocked}
                >
                  Escanear
                </button>
              </div>
            </div>

            <DecimalInput
              label="Custo unitário (opcional)"
              value={custoUnitario}
              onChange={setCustoUnitario}
              disabled={saving || isLocked}
              placeholder="0,00"
            />
            <div className="text-xs text-slate-500 leading-relaxed pt-6">
              Usa-se para custeio e auditoria (não bloqueia a operação).
            </div>
          </div>
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
            disabled={saving || authLoading || !activeEmpresaId}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            disabled={saving || authLoading || !activeEmpresaId || !operacao || isLocked}
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
