import React from 'react';
import { CompraPedido } from '@/services/compras';
import { Edit, Eye } from 'lucide-react';

interface Props {
  orders: CompraPedido[];
  onEdit: (order: CompraPedido) => void;
}

const statusColors: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-800',
  enviado: 'bg-blue-100 text-blue-800',
  recebido: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function ComprasTable({ orders, onEdit }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.map(order => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm font-medium text-gray-900">#{order.numero}</td>
              <td className="px-6 py-4 text-sm text-gray-700">{order.fornecedor_nome}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.data_emissao).toLocaleDateString('pt-BR')}</td>
              <td className="px-6 py-4 text-sm font-semibold text-gray-700">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_geral)}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusColors[order.status] || 'bg-gray-100'}`}>
                  {order.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => onEdit(order)} className="text-blue-600 hover:text-blue-800">
                  {order.status === 'recebido' ? <Eye size={18} /> : <Edit size={18} />}
                </button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum pedido de compra encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
