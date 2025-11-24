import React from 'react';
import { ContaCorrente } from '@/services/treasury';
import { Edit, Trash2, Wallet, Landmark, CreditCard } from 'lucide-react';

interface Props {
  contas: ContaCorrente[];
  onEdit: (conta: ContaCorrente) => void;
  onDelete: (conta: ContaCorrente) => void;
}

const getIcon = (tipo: string) => {
  switch (tipo) {
    case 'caixa': return <Wallet size={20} className="text-green-600" />;
    case 'carteira': return <CreditCard size={20} className="text-purple-600" />;
    default: return <Landmark size={20} className="text-blue-600" />;
  }
};

export default function ContasCorrentesTable({ contas, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome / Banco</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agência / Conta</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Atual</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {contas.map(conta => (
            <tr key={conta.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    {getIcon(conta.tipo_conta)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{conta.nome}</div>
                    <div className="text-xs text-gray-500 capitalize">{conta.tipo_conta}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {conta.tipo_conta === 'caixa' ? '-' : (
                    <>
                        Ag: {conta.agencia || '-'} / CC: {conta.conta || '-'}-{conta.digito || ''}
                        <div className="text-xs text-gray-400">{conta.banco_nome}</div>
                    </>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <span className={`font-semibold ${conta.saldo_atual && conta.saldo_atual < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: conta.moeda }).format(conta.saldo_atual || 0)}
                </span>
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${conta.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {conta.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(conta)} className="text-blue-600 hover:text-blue-800 p-1">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDelete(conta)} className="text-red-600 hover:text-red-800 p-1">
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {contas.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">Nenhuma conta cadastrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
