import React from 'react';
import { PlanoInspecao } from '@/services/industriaProducao';
import { ClipboardCheck, Shield } from 'lucide-react';

interface Props {
  planos: PlanoInspecao[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function PlanosInspecaoTable({ planos, onEdit, onDelete }: Props) {
  if (planos.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-500">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 mb-3">
          <ClipboardCheck size={20} />
        </div>
        <p className="font-semibold">Nenhum plano cadastrado</p>
        <p className="text-sm">Click em “Novo Plano” para começar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-visible border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plano</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Aplicação</th>
            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Características</th>
            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {planos.map(plano => (
            <tr key={plano.id}>
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-800">{plano.nome}</span>
                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${plano.tipo === 'IF' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {plano.tipo}
                    </span>
                    {plano.severidade && <span>Severidade: {plano.severidade}</span>}
                    {plano.aql && <span>AQL: {plano.aql}</span>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                <div className="font-medium">{plano.produto_nome}</div>
                <div className="text-xs text-gray-500">ID: {plano.produto_id}</div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {plano.roteiro_etapa_id ? (
                  <>
                    <div className="font-medium">Etapa {plano.etapa_sequencia || ''}</div>
                    <div className="text-xs text-gray-500">{plano.etapa_nome || 'Etapa do roteiro'}</div>
                  </>
                ) : plano.roteiro_id ? (
                  <>
                    <div className="font-medium">Roteiro</div>
                    <div className="text-xs text-gray-500">{plano.roteiro_nome || plano.roteiro_id}</div>
                  </>
                ) : (
                  <span className="text-xs text-gray-500">Todas as etapas</span>
                )}
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-700">
                {plano.total_caracteristicas}
              </td>
              <td className="px-4 py-3 text-center">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${plano.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Shield size={12} />
                  {plano.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3 text-center space-x-3 text-sm">
                <button className="text-blue-600 hover:text-blue-800" onClick={() => onEdit(plano.id)}>
                  Editar
                </button>
                <button className="text-red-600 hover:text-red-800" onClick={() => onDelete(plano.id)}>
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
