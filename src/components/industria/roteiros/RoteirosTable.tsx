import React, { useState } from 'react';
import { RoteiroListItem } from '@/services/industriaRoteiros';
import { Edit, CheckCircle, XCircle, Package, Copy, Trash2, MoreHorizontal } from 'lucide-react';

interface Props {
  roteiros: RoteiroListItem[];
  onEdit: (roteiro: RoteiroListItem) => void;
  onClone: (roteiro: RoteiroListItem) => void;
  onDelete: (roteiro: RoteiroListItem) => void;
}

export default function RoteirosTable({ roteiros, onEdit, onClone, onDelete }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código / Versão</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Padrão</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {roteiros.map(roteiro => (
            <tr key={roteiro.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-900 font-medium">{roteiro.produto_nome}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {roteiro.codigo || '-'} <span className="text-xs text-gray-400 ml-1">v{roteiro.versao}</span>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${roteiro.tipo_bom === 'producao' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                  {roteiro.tipo_bom}
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                {(roteiro.padrao_para_producao || roteiro.padrao_para_beneficiamento) && (
                  <CheckCircle size={16} className="text-green-500 mx-auto" />
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {roteiro.ativo ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    Inativo
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(roteiro)}
                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => onDelete(roteiro)}
                    className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-full transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setMenuId(menuId === roteiro.id ? null : roteiro.id)}
                      className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="Mais ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuId === roteiro.id && (
                      <div className="absolute right-0 mt-2 w-44 rounded-md bg-white shadow-lg border border-gray-200 z-10">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          onClick={() => {
                            setMenuId(null);
                            onClone(roteiro);
                          }}
                        >
                          <Copy size={16} /> Clonar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
          {roteiros.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum roteiro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
