import React, { useState } from 'react';
import { Operacao } from '@/services/industriaExecucao';
import { Package, User, Calendar, Clock, FileText, PauseCircle, PlayCircle, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';

interface Props {
  operacoes: Operacao[];
  onUpdateStatus: (op: Operacao, newStatus: string) => void;
  onOpenDocs?: (op: Operacao) => void;
  onStart?: (op: Operacao) => void;
  onPause?: (op: Operacao) => void;
  onConclude?: (op: Operacao) => void;
}

const statusColors: Record<string, string> = {
  planejada: 'bg-gray-100 text-gray-800',
  liberada: 'bg-blue-100 text-blue-800',
  em_execucao: 'bg-yellow-100 text-yellow-800',
  em_espera: 'bg-orange-100 text-orange-800',
  em_inspecao: 'bg-purple-100 text-purple-800',
  concluida: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
};

const STATUS_OPTIONS: Array<{ value: Operacao['status']; label: string }> = [
  { value: 'planejada', label: 'Planejada' },
  { value: 'liberada', label: 'Liberada' },
  { value: 'em_execucao', label: 'Em execução' },
  { value: 'em_espera', label: 'Em espera' },
  { value: 'em_inspecao', label: 'Em inspeção' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
];

export default function OperacoesTable({ operacoes, onUpdateStatus, onOpenDocs, onStart, onPause, onConclude }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ordem</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Centro de Trabalho</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Previsão</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">%</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {operacoes.map(op => (
            <tr key={op.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4">
                <div className="font-bold text-gray-900">{formatOrderNumber(op.ordem_numero)}</div>
                <div className="text-xs text-gray-500 capitalize">{op.tipo_ordem}</div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700 font-medium">{op.produto_nome}</span>
                </div>
                {op.cliente_nome && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                        <User size={12} /> {op.cliente_nome}
                    </div>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {op.centro_trabalho_nome}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusColors[op.status] || 'bg-gray-100'}`}>
                    {op.status.replace(/_/g, ' ')}
                  </span>
                  <select
                    value={op.status}
                    onChange={(e) => onUpdateStatus(op, e.target.value)}
                    className="text-xs border rounded-md px-2 py-1 bg-white"
                    title="Alterar status manualmente"
                    disabled={op.status === 'concluida' || op.status === 'cancelada'}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                <div className="flex flex-col">
                    {op.data_prevista_inicio && (
                        <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(op.data_prevista_inicio).toLocaleDateString('pt-BR')}</span>
                    )}
                    {op.atrasada && <span className="text-red-600 text-xs font-bold flex items-center gap-1"><Clock size={12} /> Atrasada</span>}
                </div>
              </td>
              <td className="px-6 py-4 text-center">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${Math.min(100, op.percentual_concluido)}%` }}></div>
                </div>
                <span className="text-xs text-gray-500 mt-1">{op.percentual_concluido}%</span>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="relative inline-flex">
                  <button
                    type="button"
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-700"
                    onClick={() => setMenuId(menuId === op.id ? null : op.id)}
                    title="Mais ações"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuId === op.id && (
                    <div className="absolute right-0 mt-2 w-52 rounded-md bg-white shadow-lg border border-gray-200 z-10 text-sm">
                      {onOpenDocs && (
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                          onClick={() => {
                            setMenuId(null);
                            onOpenDocs(op);
                          }}
                          disabled={!onOpenDocs}
                        >
                          <FileText size={14} /> Instruções / Docs
                        </button>
                      )}
                      {onStart && (
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
                          onClick={() => {
                            if (!onStart || op.status === 'em_execucao' || op.status === 'concluida' || op.status === 'cancelada') return;
                            setMenuId(null);
                            onStart(op);
                          }}
                          disabled={op.status === 'em_execucao' || op.status === 'concluida' || op.status === 'cancelada'}
                        >
                          <PlayCircle size={14} /> Iniciar
                        </button>
                      )}
                      {onPause && (
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
                          onClick={() => {
                            if (!onPause || op.status !== 'em_execucao') return;
                            setMenuId(null);
                            onPause(op);
                          }}
                          disabled={op.status !== 'em_execucao'}
                        >
                          <PauseCircle size={14} /> Pausar
                        </button>
                      )}
                      {onConclude && (
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
                          onClick={() => {
                            if (!onConclude || op.status === 'concluida' || op.status === 'cancelada') return;
                            setMenuId(null);
                            onConclude(op);
                          }}
                          disabled={op.status === 'concluida' || op.status === 'cancelada'}
                        >
                          <CheckCircle2 size={14} /> Concluir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {operacoes.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Nenhuma operação encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
