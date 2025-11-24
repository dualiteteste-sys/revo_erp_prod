import React from 'react';
import { ExtratoItem } from '@/services/treasury';
import { Link2, Unlink, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  extratos: ExtratoItem[];
  onConciliate: (item: ExtratoItem) => void;
  onUnconciliate: (item: ExtratoItem) => void;
}

export default function ExtratosTable({ extratos, onConciliate, onUnconciliate }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vínculo (Movimentação)</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {extratos.map(item => (
            <tr key={item.id} className={`hover:bg-gray-50 ${item.conciliado ? 'bg-green-50/30' : ''}`}>
              <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                {new Date(item.data_lancamento).toLocaleDateString('pt-BR')}
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900 font-medium">{item.descricao}</div>
                {item.documento_ref && <div className="text-xs text-gray-500">Doc: {item.documento_ref}</div>}
              </td>
              <td className={`px-6 py-4 text-right text-sm font-bold ${item.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                {item.tipo_lancamento === 'credito' ? '+' : '-'}{new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(item.valor)}
              </td>
              <td className="px-6 py-4 text-sm">
                {item.conciliado && item.movimentacao_id ? (
                    <div className="flex flex-col">
                        <span className="font-medium text-gray-800">{item.movimentacao_descricao}</span>
                        <span className="text-xs text-gray-500">
                            {new Date(item.movimentacao_data!).toLocaleDateString('pt-BR')} • 
                            R$ {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2 }).format(item.movimentacao_valor!)}
                        </span>
                    </div>
                ) : (
                    <span className="text-gray-400 text-xs italic">Pendente</span>
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {item.conciliado ? (
                    <button 
                        onClick={() => onUnconciliate(item)} 
                        className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"
                        title="Desfazer Conciliação"
                    >
                        <Unlink size={18} />
                    </button>
                ) : (
                    <button 
                        onClick={() => onConciliate(item)} 
                        className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors flex items-center gap-1 mx-auto"
                        title="Conciliar"
                    >
                        <Link2 size={18} />
                        <span className="text-xs font-semibold">Conciliar</span>
                    </button>
                )}
              </td>
            </tr>
          ))}
          {extratos.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                Nenhum lançamento encontrado no extrato.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
