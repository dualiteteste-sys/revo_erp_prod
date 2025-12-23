import React, { useState } from 'react';
import { CentroTrabalho } from '@/services/industriaCentros';
import { Edit, CheckCircle, XCircle, Copy, Trash2, MoreHorizontal } from 'lucide-react';

interface Props {
  centros: CentroTrabalho[];
  onEdit: (centro: CentroTrabalho) => void;
  onClone: (centro: CentroTrabalho) => void;
  onDelete: (centro: CentroTrabalho) => void;
  highlightCentroId?: string | null;
}

export default function CentrosTrabalhoTable({ centros, onEdit, onClone, onDelete, highlightCentroId }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo de Uso</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Capacidade (un/h)</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ativo</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {centros.map(centro => {
            const isHighlighted = highlightCentroId === centro.id;
            return (
            <tr
              key={centro.id}
              className={`transition-colors ${isHighlighted ? 'bg-amber-50/70 ring-1 ring-amber-200' : 'hover:bg-gray-50'}`}
            >
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-gray-900">{centro.nome}</div>
                {centro.descricao && <div className="text-xs text-gray-500">{centro.descricao}</div>}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">{centro.codigo || '-'}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase 
                  ${centro.tipo_uso === 'producao' ? 'bg-blue-100 text-blue-800' :
                    centro.tipo_uso === 'beneficiamento' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'}`}>
                  {centro.tipo_uso}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-right text-gray-700">
                {centro.capacidade_unidade_hora ? centro.capacidade_unidade_hora : '-'}
              </td>
              <td className="px-6 py-4 text-center">
                {centro.ativo ? (
                  <CheckCircle size={18} className="text-green-500 mx-auto" />
                ) : (
                  <XCircle size={18} className="text-gray-400 mx-auto" />
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(centro)}
                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                    title="Editar"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => onDelete(centro)}
                    className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-full transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setMenuId(menuId === centro.id ? null : centro.id)}
                      className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="Mais ações"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuId === centro.id && (
                      <div className="absolute right-0 mt-2 w-44 rounded-md bg-white shadow-lg border border-gray-200 z-10">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          onClick={() => {
                            setMenuId(null);
                            onClone(centro);
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
          );
          })}
          {centros.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum centro de trabalho encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
