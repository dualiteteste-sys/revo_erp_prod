import React from 'react';
import { CentroTrabalho } from '@/services/industriaCentros';
import { Edit, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  centros: CentroTrabalho[];
  onEdit: (centro: CentroTrabalho) => void;
}

export default function CentrosTrabalhoTable({ centros, onEdit }: Props) {
  return (
    <div className="overflow-x-auto">
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
          {centros.map(centro => (
            <tr key={centro.id} className="hover:bg-gray-50 transition-colors">
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
                <button onClick={() => onEdit(centro)} className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors">
                  <Edit size={18} />
                </button>
              </td>
            </tr>
          ))}
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
