import React from 'react';
import { OrdemIndustria } from '@/services/industria';
import { Edit, Eye, Calendar, User, Package } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';

interface Props {
  orders: OrdemIndustria[];
  onEdit: (order: OrdemIndustria) => void;
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-800',
  planejada: 'bg-blue-100 text-blue-800',
  em_programacao: 'bg-indigo-100 text-indigo-800',
  em_producao: 'bg-yellow-100 text-yellow-800',
  em_inspecao: 'bg-purple-100 text-purple-800',
  parcialmente_concluida: 'bg-teal-100 text-teal-800',
  concluida: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
};

const formatStatus = (status: string) => {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function OrdensTable({ orders, onEdit }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qtd. Plan.</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Entregue</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Previsão</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.map(order => (
            <tr key={order.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatOrderNumber(order.numero)}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700 font-medium">{order.produto_nome}</span>
                </div>
                <span className="text-xs text-gray-500 ml-6 capitalize">{order.tipo_ordem}</span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {order.cliente_nome ? (
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-gray-400" />
                    {order.cliente_nome}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">-</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-center text-gray-700">
                {order.quantidade_planejada} <span className="text-xs text-gray-500">{order.unidade}</span>
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`text-sm font-semibold ${order.total_entregue >= order.quantidade_planejada ? 'text-green-600' : 'text-gray-600'}`}>
                  {order.total_entregue}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {order.data_prevista_entrega ? (
                  <div className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(order.data_prevista_entrega).toLocaleDateString('pt-BR')}
                  </div>
                ) : '-'}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusColors[order.status] || 'bg-gray-100'}`}>
                  {formatStatus(order.status)}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => onEdit(order)} className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors">
                  {order.status === 'concluida' || order.status === 'cancelada' ? <Eye size={18} /> : <Edit size={18} />}
                </button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-gray-500">Nenhuma ordem de produção encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
