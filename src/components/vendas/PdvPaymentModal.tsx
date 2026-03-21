import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Check, CreditCard, Plus, QrCode, Smartphone, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import { PDV_QUICK_PAYMENTS, getSefazCode } from '@/lib/formaPagamentoSefaz';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';
import { useNumericField } from '@/hooks/useNumericField';

export type PdvPagamento = {
  forma_pagamento: string;
  forma_pagamento_sefaz: string;
  valor: number;
  valor_recebido?: number;
  troco?: number;
  parcelas?: number;
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

const ICON_MAP: Record<string, React.ReactNode> = {
  'Dinheiro': <Banknote className="w-5 h-5" />,
  'Pix': <Smartphone className="w-5 h-5" />,
  'Cartao de credito': <CreditCard className="w-5 h-5" />,
  'Cartao de debito': <CreditCard className="w-5 h-5" />,
};

const ICON_MAP_SM: Record<string, React.ReactNode> = {
  'Dinheiro': <Banknote className="w-4 h-4" />,
  'Pix': <Smartphone className="w-4 h-4" />,
  'Cartao de credito': <CreditCard className="w-4 h-4" />,
  'Cartao de debito': <CreditCard className="w-4 h-4" />,
};

/* ---------- Sub-component: stable hook calls for each payment line ---------- */

type PaymentLineCardProps = {
  line: PdvPagamento;
  idx: number;
  canRemove: boolean;
  autoFocusRecebido: boolean;
  onUpdateValor: (idx: number, val: number) => void;
  onUpdateRecebido: (idx: number, val: number) => void;
  onUpdateParcelas: (idx: number, parcelas: number) => void;
  onRemove: (idx: number) => void;
};

function PaymentLineCard({
  line, idx, canRemove, autoFocusRecebido,
  onUpdateValor, onUpdateRecebido, onUpdateParcelas, onRemove,
}: PaymentLineCardProps) {
  const recebidoRef = useRef<HTMLInputElement>(null);
  const isDinheiro = line.forma_pagamento === 'Dinheiro';
  const isCredito = line.forma_pagamento_sefaz === '03';

  const valorField = useNumericField(line.valor, (v) => onUpdateValor(idx, v ?? 0));
  const recebidoField = useNumericField(line.valor_recebido ?? null, (v) => onUpdateRecebido(idx, v ?? 0));

  useEffect(() => {
    if (autoFocusRecebido && isDinheiro) {
      setTimeout(() => recebidoRef.current?.focus(), 150);
    }
  }, [autoFocusRecebido, isDinheiro]);

  const parcelaValor = isCredito && (line.parcelas ?? 1) > 1
    ? line.valor / (line.parcelas ?? 1)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white/60 dark:bg-zinc-800/60 backdrop-blur-sm border border-white/30 dark:border-zinc-700/50 rounded-2xl p-4 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
          {ICON_MAP_SM[line.forma_pagamento] || <QrCode className="w-4 h-4" />}
          {line.forma_pagamento}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Remover"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Valor</label>
          <input
            type="text"
            inputMode="numeric"
            {...valorField}
            className="w-full px-3 py-2.5 text-sm font-medium border rounded-xl bg-white/70 dark:bg-zinc-700/70 border-gray-200/60 dark:border-zinc-600/60 text-right focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
          />
        </div>

        {isDinheiro && (
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Recebido</label>
            <input
              ref={recebidoRef}
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              {...recebidoField}
              className="w-full px-3 py-2.5 text-sm font-medium border rounded-xl bg-white/70 dark:bg-zinc-700/70 border-gray-200/60 dark:border-zinc-600/60 text-right focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
            />
          </div>
        )}
      </div>

      {/* Parcelas (crédito) */}
      {isCredito && (
        <div className="mt-3">
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Parcelas</label>
          <div className="flex items-center gap-2">
            <select
              value={line.parcelas ?? 1}
              onChange={(e) => onUpdateParcelas(idx, Number(e.target.value))}
              className="px-3 py-2 text-sm border rounded-xl bg-white/70 dark:bg-zinc-700/70 border-gray-200/60 dark:border-zinc-600/60 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </select>
            {parcelaValor != null && (
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                {(line.parcelas ?? 1)}x de {formatBRL(parcelaValor)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Troco (dinheiro) */}
      {isDinheiro && line.troco != null && line.troco > 0 && (
        <div className="mt-3 flex justify-between items-center bg-amber-50/80 dark:bg-amber-900/20 backdrop-blur-sm border border-amber-200/50 dark:border-amber-700/30 rounded-xl px-3 py-2">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Troco</span>
          <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatBRL(line.troco)}</span>
        </div>
      )}
    </motion.div>
  );
}

/* ---------- Main component ---------- */

export default function PdvPaymentModal({ isOpen, onClose, totalGeral, pedidoNumero, onConfirm }: Props) {
  const [lines, setLines] = useState<PdvPagamento[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

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

  const totalPago = useMemo(() => lines.reduce((s, l) => s + l.valor, 0), [lines]);
  const restante = totalGeral - totalPago;
  const isValid = Math.abs(restante) < 0.02;

  const handleQuickSelect = useCallback((label: string, sefaz: string) => {
    if (lines.length === 1 && lines[0].valor === totalGeral) {
      setLines([{ forma_pagamento: label, forma_pagamento_sefaz: sefaz, valor: totalGeral }]);
    } else {
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

  const handleUpdateParcelas = useCallback((idx: number, parcelas: number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, parcelas } : l));
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
      <div className="p-5 space-y-5">
        {/* Total — gradient glass card */}
        <div className="bg-gradient-to-br from-emerald-500/90 to-emerald-600/90 rounded-2xl p-5 text-center shadow-lg shadow-emerald-500/20">
          <p className="text-emerald-100 text-sm font-medium tracking-wide">Total da Venda</p>
          <p className="text-3xl font-bold text-white mt-1 tracking-tight">{formatBRL(totalGeral)}</p>
        </div>

        {/* Quick payment buttons — pill style */}
        <div className="flex flex-wrap gap-2">
          {PDV_QUICK_PAYMENTS.map(({ label, sefaz }) => {
            const isActive = lines.length === 1 && lines[0].forma_pagamento === label;
            return (
              <motion.button
                key={label}
                type="button"
                onClick={() => handleQuickSelect(label, sefaz)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl border transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-500/10 border-blue-400/40 text-blue-700 dark:text-blue-300 font-semibold shadow-sm'
                    : 'bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm border-white/30 dark:border-zinc-700/50 text-gray-700 dark:text-zinc-300 hover:bg-white/70 dark:hover:bg-zinc-700/70 hover:shadow-sm'
                }`}
              >
                {ICON_MAP[label] || <QrCode className="w-5 h-5" />}
                {label}
              </motion.button>
            );
          })}
          <motion.button
            type="button"
            onClick={() => setShowDropdown(true)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-xl border border-dashed border-gray-300/60 dark:border-zinc-600/60 text-gray-500 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Outra
          </motion.button>
        </div>

        {/* Custom payment dropdown */}
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm border border-white/30 dark:border-zinc-700/50 rounded-xl p-3"
          >
            <div className="flex-1">
              <MeioPagamentoDropdown
                tipo="recebimento"
                value=""
                onChange={(val) => { if (val) handleAddCustom(val); }}
                placeholder="Selecione forma de pagamento..."
              />
            </div>
            <button type="button" onClick={() => setShowDropdown(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Payment lines */}
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <PaymentLineCard
              key={`${line.forma_pagamento}-${idx}`}
              line={line}
              idx={idx}
              canRemove={lines.length > 1}
              autoFocusRecebido={idx === 0 && lines.length === 1}
              onUpdateValor={handleUpdateValor}
              onUpdateRecebido={handleUpdateRecebido}
              onUpdateParcelas={handleUpdateParcelas}
              onRemove={handleRemoveLine}
            />
          ))}
        </div>

        {/* Add split payment */}
        {lines.length > 0 && restante > 0.02 && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowDropdown(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium transition-colors"
            >
              + Adicionar forma de pagamento ({formatBRL(restante)} restante)
            </button>
          </div>
        )}

        {/* Validation message */}
        {!isValid && lines.length > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-red-500 dark:text-red-400 text-center bg-red-50/60 dark:bg-red-900/10 rounded-xl py-2 px-3"
          >
            {restante > 0
              ? `Faltam ${formatBRL(restante)} para completar o pagamento.`
              : `Valor excede o total em ${formatBRL(Math.abs(restante))}.`
            }
          </motion.p>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-200/40 dark:border-zinc-700/40">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-zinc-400 hover:bg-gray-100/60 dark:hover:bg-zinc-800/60 rounded-xl transition-all duration-200"
          >
            Cancelar
          </button>
          <motion.button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            whileHover={isValid && !submitting ? { scale: 1.02 } : {}}
            whileTap={isValid && !submitting ? { scale: 0.98 } : {}}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-zinc-600 dark:disabled:to-zinc-700 rounded-xl shadow-lg shadow-emerald-500/25 disabled:shadow-none transition-all duration-200 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Finalizando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirmar (F9)
              </>
            )}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}
