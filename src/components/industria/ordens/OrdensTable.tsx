import React, { useState } from 'react';
import { OrdemIndustria } from '@/services/industria';
import { Copy, Edit, Eye, Calendar, User, Package, MoreHorizontal, Trash2 } from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { deleteOrdemProducao } from '@/services/industriaProducao';

interface Props {
  orders: OrdemIndustria[];
  onEdit: (order: OrdemIndustria) => void;
  onClone?: (order: OrdemIndustria) => void;
  onChanged?: () => void; // refresh callback após delete/clone/etc
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

export default function OrdensTable({ orders, onEdit, onClone, onChanged }: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [menuId, setMenuId] = useState<string | null>(null);

  const handleClone = async (order: OrdemIndustria) => {
    setMenuId(null);
    onClone?.(order);
  };

  const handleDelete = async (order: OrdemIndustria) => {
    setMenuId(null);

    // Só suportamos delete direto para OP (industrializacao). Outros tipos usam fluxo próprio.
    if (order.tipo_ordem !== 'industrializacao') {
      addToast('Exclusão rápida disponível apenas para OP de industrialização.', 'info');
      return;
    }

    const ok = await confirm({
      title: 'Excluir OP',
      description: 'Excluirá esta OP se estiver em rascunho e sem operações/apontamentos/entregas.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'warning',
    });
    if (!ok) return;

    try {
      await deleteOrdemProducao(order.id);
      addToast('OP excluída com sucesso.', 'success');
      onChanged?.();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('já possui operações')) {
        addToast('Não é possível excluir: há operações. Remova as operações/apontamentos antes.', 'error');
      } else if (msg.toLowerCase().includes('entregas')) {
        addToast('Não é possível excluir: há entregas. Remova entregas antes.', 'error');
      } else if (msg.toLowerCase().includes('rascunho')) {
        addToast('Só é possível excluir OP em rascunho.', 'error');
      } else {
        addToast('Erro ao excluir OP: ' + msg, 'error');
      }
    }
  };

  return (
    <div className="overflow-x-auto overflow-y-visible">
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
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onEdit(order)}
                    className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                    title={order.status === 'concluida' || order.status === 'cancelada' ? 'Visualizar' : 'Abrir'}
                  >
                    {order.status === 'concluida' || order.status === 'cancelada' ? <Eye size={18} /> : <Edit size={18} />}
                  </button>
                  {(onClone || order.tipo_ordem === 'industrializacao') && (
                    <div className="relative">
                      <button
                        onClick={() => setMenuId(menuId === order.id ? null : order.id)}
                        className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Mais ações"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menuId === order.id && (
                        <div className="absolute right-0 mt-2 w-48 rounded-md bg-white shadow-lg border border-gray-200 z-10">
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                            onClick={() => handleClone(order)}
                          >
                            <Copy size={16} /> Clonar OP
                          </button>
                          {order.tipo_ordem === 'industrializacao' && (
                            <button
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-700 hover:bg-gray-100"
                              onClick={() => handleDelete(order)}
                            >
                              <Trash2 size={16} /> Excluir OP
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
