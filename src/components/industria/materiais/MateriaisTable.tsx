import React from 'react';
import { MaterialClienteListItem } from '@/services/industriaMateriais';
import { Edit, Trash2, Package, User, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  materiais: MaterialClienteListItem[];
  onEdit: (material: MaterialClienteListItem) => void;
  onDelete: (material: MaterialClienteListItem) => void;
}

export default function MateriaisTable({ materiais, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto Interno</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref. Cliente</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Unidade</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {materiais.map(item => (
            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{item.cliente_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{item.produto_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <div className="font-medium">{item.codigo_cliente || '-'}</div>
                <div className="text-xs text-gray-500">{item.nome_cliente}</div>
              </td>
              <td className="px-6 py-4 text-center text-sm text-gray-600">
                {item.unidade || '-'}
              </td>
              <td className="px-6 py-4 text-center">
                {item.ativo ? (
                  <CheckCircle size={18} className="text-green-500 mx-auto" title="Ativo" />
                ) : (
                  <XCircle size={18} className="text-gray-400 mx-auto" title="Inativo" />
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(item)} className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDelete(item)} className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-full transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {materiais.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                Nenhum material encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
