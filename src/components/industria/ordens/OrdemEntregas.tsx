import React, { useState } from 'react';
import { OrdemEntrega } from '@/services/industria';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import Section from '@/components/ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';

interface OrdemEntregasProps {
  entregas: OrdemEntrega[];
  onAddEntrega: (data: Partial<OrdemEntrega>) => Promise<void>;
  onRemoveEntrega: (entregaId: string) => Promise<void>;
  readOnly?: boolean;
  maxQuantity: number;
  currentTotal: number;
  showBillingStatus?: boolean; // Flag para diferenciar Produção vs Beneficiamento
}

const OrdemEntregas: React.FC<OrdemEntregasProps> = ({ 
  entregas, 
  onAddEntrega, 
  onRemoveEntrega, 
  readOnly, 
  maxQuantity, 
  currentTotal,
  showBillingStatus = false 
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newEntrega, setNewEntrega] = useState<Partial<OrdemEntrega>>({
    data_entrega: new Date().toISOString().split('T')[0],
    quantidade_entregue: 0,
    status_faturamento: 'nao_faturado',
    documento_ref: '',
    documento_entrega: '',
    observacoes: ''
  });

  const handleAdd = async () => {
    if (!newEntrega.quantidade_entregue || newEntrega.quantidade_entregue <= 0) return;
    setIsAdding(true);
    try {
        await onAddEntrega(newEntrega);
        setNewEntrega({
            data_entrega: new Date().toISOString().split('T')[0],
            quantidade_entregue: 0,
            status_faturamento: 'nao_faturado',
            documento_ref: '',
            documento_entrega: '',
            observacoes: ''
        });
    } finally {
        setIsAdding(false);
    }
  };

  const remaining = Math.max(0, maxQuantity - currentTotal);

  return (
    <Section title="Entregas / Produção Realizada" description="Registre as entregas parciais ou finais desta ordem.">
        <div className="sm:col-span-6">
            
            <div className="flex gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex-1">
                    <p className="text-xs text-blue-600 font-medium uppercase">Planejado</p>
                    <p className="text-2xl font-bold text-blue-800">{maxQuantity}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex-1">
                    <p className="text-xs text-green-600 font-medium uppercase">Realizado</p>
                    <p className="text-2xl font-bold text-green-800">{currentTotal}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex-1">
                    <p className="text-xs text-gray-600 font-medium uppercase">Restante</p>
                    <p className="text-2xl font-bold text-gray-800">{remaining}</p>
                </div>
            </div>

            {!readOnly && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <Plus size={16} /> Registrar Nova Entrega
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                        <div className="sm:col-span-3">
                            <Input 
                                label="Data" 
                                name="data_entrega" 
                                type="date" 
                                value={newEntrega.data_entrega} 
                                onChange={e => setNewEntrega({...newEntrega, data_entrega: e.target.value})} 
                            />
                        </div>
                        <div className="sm:col-span-3">
                            <Input 
                                label="Quantidade" 
                                name="qtd" 
                                type="number" 
                                value={newEntrega.quantidade_entregue || ''} 
                                onChange={e => setNewEntrega({...newEntrega, quantidade_entregue: parseFloat(e.target.value)})} 
                                placeholder="0.00"
                            />
                        </div>
                        {showBillingStatus && (
                            <div className="sm:col-span-3">
                                <Select 
                                    label="Status Fat." 
                                    name="status_fat" 
                                    value={newEntrega.status_faturamento} 
                                    onChange={e => setNewEntrega({...newEntrega, status_faturamento: e.target.value})}
                                >
                                    <option value="nao_faturado">Não Faturado</option>
                                    <option value="pronto_para_faturar">Pronto p/ Faturar</option>
                                    <option value="faturado">Faturado</option>
                                </Select>
                            </div>
                        )}
                        <div className={showBillingStatus ? "sm:col-span-3" : "sm:col-span-6"}>
                            <button 
                                onClick={handleAdd}
                                disabled={isAdding || !newEntrega.quantidade_entregue}
                                className="w-full bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                                Adicionar
                            </button>
                        </div>
                        <div className="sm:col-span-6">
                            <Input 
                                label={showBillingStatus ? "Doc. Entrega / Romaneio" : "Ref. Documento"} 
                                name="doc_ref" 
                                value={showBillingStatus ? newEntrega.documento_entrega || '' : newEntrega.documento_ref || ''} 
                                onChange={e => showBillingStatus 
                                    ? setNewEntrega({...newEntrega, documento_entrega: e.target.value})
                                    : setNewEntrega({...newEntrega, documento_ref: e.target.value})
                                } 
                                placeholder="Ex: NF 123, Lote A..."
                            />
                        </div>
                        <div className="sm:col-span-6">
                            <Input 
                                label="Observações" 
                                name="obs" 
                                value={newEntrega.observacoes || ''} 
                                onChange={e => setNewEntrega({...newEntrega, observacoes: e.target.value})} 
                                placeholder="Detalhes da entrega..."
                            />
                        </div>
                    </div>
                </div>
            )}
            
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
                            {showBillingStatus && <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Fat.</th>}
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref.</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Obs.</th>
                            {!readOnly && <th className="px-3 py-3"></th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        <AnimatePresence>
                            {entregas.map((entrega) => (
                                <motion.tr 
                                    key={entrega.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="hover:bg-gray-50"
                                >
                                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                                        {new Date(entrega.data_entrega).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-3 py-3 whitespace-nowrap text-sm text-right font-bold text-gray-800">
                                        {entrega.quantidade_entregue}
                                    </td>
                                    {showBillingStatus && (
                                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs ${
                                                entrega.status_faturamento === 'faturado' ? 'bg-green-100 text-green-800' :
                                                entrega.status_faturamento === 'pronto_para_faturar' ? 'bg-blue-100 text-blue-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {entrega.status_faturamento === 'nao_faturado' ? 'Não Faturado' : 
                                                entrega.status_faturamento === 'pronto_para_faturar' ? 'Pronto' : 'Faturado'}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {showBillingStatus ? entrega.documento_entrega || '-' : entrega.documento_ref || '-'}
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-500 truncate max-w-xs">
                                        {entrega.observacoes || '-'}
                                    </td>
                                    {!readOnly && (
                                        <td className="px-3 py-3 text-center w-10">
                                            <button 
                                                type="button" 
                                                onClick={() => onRemoveEntrega(entrega.id)} 
                                                className="p-1 text-red-400 hover:text-red-600 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                        {entregas.length === 0 && (
                            <tr>
                                <td colSpan={showBillingStatus ? 6 : 5} className="text-center py-8 text-gray-500">
                                    Nenhuma entrega registrada.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </Section>
  );
};

export default OrdemEntregas;
