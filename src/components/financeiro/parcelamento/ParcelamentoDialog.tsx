import React from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import { previewParcelamento, type ParcelamentoPreviewItem } from '@/services/financeiroParcelamento';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  total: number;
  defaultCondicao?: string | null;
  defaultBaseDateISO?: string | null;
  confirmText?: string;
  onConfirm: (params: { condicao: string; baseDateISO: string; preview: ParcelamentoPreviewItem[] }) => Promise<void>;
};

function formatMoneyBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
}

export default function ParcelamentoDialog({
  open,
  onClose,
  title,
  total,
  defaultCondicao,
  defaultBaseDateISO,
  confirmText = 'Gerar títulos',
  onConfirm,
}: Props) {
  const { addToast } = useToast();
  const [condicao, setCondicao] = React.useState<string>('');
  const [baseDateISO, setBaseDateISO] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [preview, setPreview] = React.useState<ParcelamentoPreviewItem[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setCondicao((defaultCondicao ?? '').trim() || '1x');
    setBaseDateISO((defaultBaseDateISO ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    setPreview([]);
  }, [open, defaultCondicao, defaultBaseDateISO]);

  React.useEffect(() => {
    if (!open) return;
    if (!baseDateISO) return;
    if (!Number.isFinite(Number(total)) || Number(total) <= 0) return;

    const t = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const rows = await previewParcelamento({
          total: Number(total),
          condicao: condicao || '1x',
          baseDateISO,
        });
        setPreview(rows ?? []);
      } catch (e: any) {
        setPreview([]);
        addToast(e?.message || 'Falha ao calcular parcelas.', 'error');
      } finally {
        setPreviewLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [open, total, condicao, baseDateISO, addToast]);

  const sum = React.useMemo(() => preview.reduce((acc, p) => acc + Number(p.valor || 0), 0), [preview]);

  const handleConfirm = async () => {
    if (loading) return;
    if (!baseDateISO) {
      addToast('Selecione a data base.', 'error');
      return;
    }
    if (!preview.length) {
      addToast('Não foi possível calcular as parcelas.', 'error');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({ condicao: condicao || '1x', baseDateISO, preview });
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar títulos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="3xl">
      <div className="p-6 space-y-5">
        <div className="rounded-xl border border-white/30 bg-white/70 p-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-sm text-gray-600">Total</div>
              <div className="text-2xl font-extrabold text-gray-900">{formatMoneyBRL(Number(total || 0))}</div>
            </div>
            <div className="text-sm text-gray-600 text-right">
              <div>Condição aceita: <span className="font-semibold">30/60/90</span>, <span className="font-semibold">3x</span>, <span className="font-semibold">+2x</span></div>
              <div className="mt-1">Ajuste de centavos é aplicado na última parcela.</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <Input
            className="sm:col-span-3"
            label="Condição de pagamento"
            value={condicao}
            onChange={(e) => setCondicao(e.target.value)}
            placeholder="Ex: 30/60/90 ou 3x"
          />
          <Input
            className="sm:col-span-3"
            label="Data base"
            type="date"
            value={baseDateISO}
            onChange={(e) => setBaseDateISO(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-white/30 bg-white/70 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/20 flex items-center justify-between">
            <div className="font-semibold text-gray-900">Preview</div>
            {previewLoading ? (
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Calculando…
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                {preview.length ? `${preview.length} parcela(s) • Total: ${formatMoneyBRL(Number(sum || 0))}` : '—'}
              </div>
            )}
          </div>

          <div className="max-h-[40vh] overflow-y-auto scrollbar-styled">
            {preview.length ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50/60 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Parcela</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Vencimento</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white/40">
                  {preview.map((p) => (
                    <tr key={`${p.numero_parcela}-${p.vencimento}`}>
                      <td className="px-4 py-2 text-sm text-gray-800">{p.numero_parcela}</td>
                      <td className="px-4 py-2 text-sm text-gray-800">{new Date(String(p.vencimento)).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right font-semibold">{formatMoneyBRL(Number(p.valor || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 text-sm text-gray-600">Nenhuma parcela calculada.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/70 hover:bg-white/90 border border-white/40 text-gray-800 font-semibold transition"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading || previewLoading || !preview.length}
          >
            {loading ? 'Gerando…' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

