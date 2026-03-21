import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Plus, QrCode, Smartphone, Trash2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { PDV_QUICK_PAYMENTS, getSefazCode } from '@/lib/formaPagamentoSefaz';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';

export type PdvPagamento = {
  forma_pagamento: string;
  forma_pagamento_sefaz: string;
  valor: number;
  valor_recebido?: number;
  troco?: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  totalGeral: number;
  pedidoNumero?: number;
  onConfirm: (pagamentos: PdvPagamento[]) => Promise<void>;
};

function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function parseBRL(s: string): number {
  const clean = s.replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'Dinheiro': <Banknote className="w-4 h-4" />,
  'Pix': <Smartphone className="w-4 h-4" />,
  'Cartao de credito': <CreditCard className="w-4 h-4" />,
  'Cartao de debito': <CreditCard className="w-4 h-4" />,
};

export default function PdvPaymentModal({ isOpen, onClose, totalGeral, pedidoNumero, onConfirm }: Props) {
  const [lines, setLines] = useState<PdvPagamento[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const valorRecebidoRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setLines([{
        forma_pagamento: 'Dinheiro',
        forma_pagamento_sefaz: '01',
        valor: totalGeral,
      }]);
      setSubmitting(false);
      setShowDropdown(false);
    }
  }, [isOpen, totalGeral]);

  // Auto-focus valor_recebido when Dinheiro
  useEffect(() => {
    if (isOpen && lines.length === 1 && lines[0].forma_pagamento === 'Dinheiro') {
      setTimeout(() => valorRecebidoRef.current?.focus(), 150);
    }
  }, [isOpen, lines]);

  const totalPago = useMemo(() => lines.reduce((s, l) => s + l.valor, 0), [lines]);
  const restante = totalGeral - totalPago;
  const isValid = Math.abs(restante) < 0.02; // tolerance R$0.01

  const handleQuickSelect = useCallback((label: string, sefaz: string) => {
    if (lines.length === 1 && lines[0].valor === totalGeral) {
      // Replace single line
      setLines([{ forma_pagamento: label, forma_pagamento_sefaz: sefaz, valor: totalGeral }]);
    } else {
      // Add new line with remaining
      const remaining = Math.max(0, totalGeral - totalPago);
      if (remaining <= 0) return;
      setLines(prev => [...prev, { forma_pagamento: label, forma_pagamento_sefaz: sefaz, valor: remaining }]);
    }
    setShowDropdown(false);
  }, [lines, totalGeral, totalPago]);

  const handleAddCustom = useCallback((nome: string) => {
    const remaining = Math.max(0, totalGeral - totalPago);
    setLines(prev => [
      ...prev,
      { forma_pagamento: nome, forma_pagamento_sefaz: getSefazCode(nome), valor: remaining > 0 ? remaining : 0 },
    ]);
    setShowDropdown(false);
  }, [totalGeral, totalPago]);

  const handleRemoveLine = useCallback((idx: number) => {
    setLines(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        return [{ forma_pagamento: 'Dinheiro', forma_pagamento_sefaz: '01', valor: totalGeral }];
      }
      return next;
    });
  }, [totalGeral]);

  const handleUpdateValor = useCallback((idx: number, val: number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, valor: val } : l));
  }, []);

  const handleUpdateRecebido = useCallback((idx: number, val: number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const troco = Math.max(0, val - l.valor);
      return { ...l, valor_recebido: val, troco };
    }));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(lines);
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, lines, onConfirm]);

  // F9 keyboard shortcut
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleConfirm]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Pagamento${pedidoNumero ? ` — PDV #${pedidoNumero}` : ''}`}
      size="md"
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        {/* Total */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 text-center">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Total da Venda</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{formatBRL(totalGeral)}</p>
        </div>

        {/* Quick payment buttons */}
        <div className="flex flex-wrap gap-2">
          {PDV_QUICK_PAYMENTS.map(({ label, sefaz }) => (
            <button
              key={label}
              type="button"
              onClick={() => handleQuickSelect(label, sefaz)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                lines.length === 1 && lines[0].forma_pagamento === label
                  ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {ICON_MAP[label] || <QrCode className="w-4 h-4" />}
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowDropdown(true)}
            className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4" />
            Outra
          </button>
        </div>

        {/* Custom payment dropdown */}
        {showDropdown && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <MeioPagamentoDropdown
                tipo="recebimento"
                value=""
                onChange={(val) => {
                  if (val) handleAddCustom(val);
                }}
                placeholder="Selecione forma de pagamento..."
              />
            </div>
            <button type="button" onClick={() => setShowDropdown(false)} className="p-2 text-zinc-400 hover:text-zinc-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Payment lines */}
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={idx} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  {ICON_MAP[line.forma_pagamento] || <QrCode className="w-4 h-4" />}
                  {line.forma_pagamento}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    className="p-1 text-zinc-400 hover:text-red-500"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">Valor</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.valor.toFixed(2).replace('.', ',')}
                    onChange={(e) => handleUpdateValor(idx, parseBRL(e.target.value))}
                    className="w-full mt-0.5 px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-right"
                  />
                </div>

                {line.forma_pagamento === 'Dinheiro' && (
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">Recebido</label>
                    <input
                      ref={idx === 0 ? valorRecebidoRef : undefined}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={line.valor_recebido != null ? line.valor_recebido.toFixed(2).replace('.', ',') : ''}
                      onChange={(e) => handleUpdateRecebido(idx, parseBRL(e.target.value))}
                      className="w-full mt-0.5 px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-right"
                    />
                  </div>
                )}
              </div>

              {line.forma_pagamento === 'Dinheiro' && line.troco != null && line.troco > 0 && (
                <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Troco</span>
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatBRL(line.troco)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add split payment */}
        {lines.length > 0 && restante > 0.02 && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowDropdown(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Adicionar forma de pagamento ({formatBRL(restante)} restante)
            </button>
          </div>
        )}

        {/* Validation message */}
        {!isValid && lines.length > 0 && (
          <p className="text-xs text-red-500 text-center">
            {restante > 0
              ? `Faltam ${formatBRL(restante)} para completar o pagamento.`
              : `Valor excede o total em ${formatBRL(Math.abs(restante))}.`
            }
          </p>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {submitting ? 'Finalizando...' : 'Confirmar (F9)'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
