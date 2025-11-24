import React from 'react';
import { Movimentacao } from '@/services/treasury';
import { Edit, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle, Circle } from 'lucide-react';

interface Props {
  movimentacoes: Movimentacao[];
  onEdit: (mov: Movimentacao) => void;
  onDelete: (mov: Movimentacao) => void;
}

export default function MovimentacoesTable({ movimentacoes, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entrada</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saída</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Conc.</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {movimentacoes.map(mov => (
            <tr key={mov.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                {new Date(mov.data_movimento).toLocaleDateString('pt-BR')}
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900 font-medium">{mov.descricao}</div>
                <div className="text-xs text-gray-500">
                    {mov.categoria && <span className="mr-2 bg-gray-100 px-1 rounded">{mov.categoria}</span>}
                    {mov.documento_ref && <span>Doc: {mov.documento_ref}</span>}
                </div>
              </td>
              <td className="px-6 py-4 text-right text-sm text-green-600 font-medium">
                {mov.valor_entrada ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(mov.valor_entrada) : ''}
              </td>
              <td className="px-6 py-4 text-right text-sm text-red-600 font-medium">
                {mov.valor_saida ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(mov.valor_saida) : ''}
              </td>
              <td className="px-6 py-4 text-right text-sm font-bold text-gray-800">
                {mov.saldo_acumulado !== undefined ? new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(mov.saldo_acumulado) : '-'}
              </td>
              <td className="px-6 py-4 text-center">
                {mov.conciliado ? (
                    <CheckCircle size={16} className="text-green-500 mx-auto" title="Conciliado" />
                ) : (
                    <Circle size={16} className="text-gray-300 mx-auto" title="Pendente" />
                )}
              </td>
              <td className="px-6 py-4 text-right">
                {!mov.conciliado && (
                    <div className="flex justify-end gap-2">
                    <button onClick={() => onEdit(mov)} className="text-blue-600 hover:text-blue-800 p-1">
                        <Edit size={16} />
                    </button>
                    <button onClick={() => onDelete(mov)} className="text-red-600 hover:text-red-800 p-1">
                        <Trash2 size={16} />
                    </button>
                    </div>
                )}
              </td>
            </tr>
          ))}
          {movimentacoes.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Nenhuma movimentação no período.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
