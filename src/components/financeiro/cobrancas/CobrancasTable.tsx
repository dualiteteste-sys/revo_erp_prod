import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CobrancaBancaria } from '@/services/cobrancas';
import { Edit, Trash2, FileText, Barcode } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  cobrancas: CobrancaBancaria[];
  onEdit: (cobranca: CobrancaBancaria) => void;
  onDelete: (cobranca: CobrancaBancaria) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente_emissao: { label: 'Pendente', color: 'bg-gray-100 text-gray-800' },
  emitida: { label: 'Emitida', color: 'bg-blue-100 text-blue-800' },
  registrada: { label: 'Registrada', color: 'bg-indigo-100 text-indigo-800' },
  enviada: { label: 'Enviada', color: 'bg-purple-100 text-purple-800' },
  liquidada: { label: 'Liquidada', color: 'bg-green-100 text-green-800' },
  baixada: { label: 'Baixada', color: 'bg-yellow-100 text-yellow-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  erro: { label: 'Erro', color: 'bg-red-200 text-red-900' },
};

export default function CobrancasTable({ cobrancas, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documento / Ref</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimento</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {cobrancas.map((cobranca) => {
              const venc = new Date(cobranca.data_vencimento);
              const isValidDate = !Number.isNaN(venc.getTime());
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isFinal = ['liquidada', 'baixada', 'cancelada'].includes(String(cobranca.status));
              const isOverdue = isValidDate && !isFinal && venc.getTime() < today.getTime();

              return (
              <motion.tr
                key={cobranca.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-orange-50/40' : ''}`}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {cobranca.tipo_cobranca === 'boleto' ? <Barcode size={16} className="text-gray-400" /> : <FileText size={16} className="text-gray-400" />}
                    <span className="text-sm font-medium text-gray-900">{cobranca.documento_ref || 'S/N'}</span>
                  </div>
                  <div className="text-xs text-gray-500 ml-6">{cobranca.descricao}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {cobranca.cliente_nome || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span>{isValidDate ? venc.toLocaleDateString('pt-BR') : String(cobranca.data_vencimento || '—')}</span>
                    {isOverdue ? (
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                        Atrasada
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-right font-semibold text-gray-800">
                  {formatCurrency(cobranca.valor_atual * 100)}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusConfig[cobranca.status]?.color || 'bg-gray-100'}`}>
                    {statusConfig[cobranca.status]?.label || cobranca.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onEdit(cobranca)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => onDelete(cobranca)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </motion.tr>
              );
            })}
          </AnimatePresence>
          {cobrancas.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhuma cobrança encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
