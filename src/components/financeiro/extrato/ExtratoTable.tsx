import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtratoLancamento } from '@/services/extrato';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle, Circle, Link2 } from 'lucide-react';

interface Props {
  lancamentos: ExtratoLancamento[];
}

export default function ExtratoTable({ lancamentos }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conta</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Conc.</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vínculo</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          <AnimatePresence>
            {lancamentos.map((item) => (
              <motion.tr
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(item.data_lancamento).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {item.conta_nome}
                </td>
                <td className="px-6 py-4 text-sm text-gray-800">
                  <div className="font-medium">{item.descricao}</div>
                  {item.documento_ref && <div className="text-xs text-gray-500">Doc: {item.documento_ref}</div>}
                </td>
                <td className={`px-6 py-4 text-right text-sm font-bold ${item.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                  {item.tipo_lancamento === 'credito' ? '+' : '-'}{formatCurrency(item.valor * 100)}
                </td>
                <td className="px-6 py-4 text-right text-sm text-gray-700">
                  {item.saldo_apos_lancamento !== null ? formatCurrency(item.saldo_apos_lancamento * 100) : '-'}
                </td>
                <td className="px-6 py-4 text-center">
                  {item.conciliado ? (
                    <CheckCircle size={16} className="text-green-500 mx-auto" title="Conciliado" />
                  ) : (
                    <Circle size={16} className="text-gray-300 mx-auto" title="Pendente" />
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {item.movimentacao_id ? (
                    <div className="flex items-center gap-1 text-blue-600" title={item.movimentacao_descricao || 'Movimentação'}>
                      <Link2 size={14} />
                      <span className="truncate max-w-[150px]">{item.movimentacao_descricao || 'Vínculo'}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">-</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
          {lancamentos.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                Nenhum lançamento encontrado para os filtros selecionados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
