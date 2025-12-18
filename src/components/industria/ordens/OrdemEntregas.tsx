import React, { useState, useMemo } from 'react';
import { OrdemEntrega } from '@/services/industria';
import { Trash2, Plus, AlertCircle, Calendar, Package } from 'lucide-react';
import Section from '@/components/ui/forms/Section';
import { motion, AnimatePresence } from 'framer-motion';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { formatOrderNumber } from '@/lib/utils';

interface OrdemEntregasProps {
  entregas: OrdemEntrega[];
  onAddEntrega: (data: Partial<OrdemEntrega>) => void;
  onRemoveEntrega: (entregaId: string) => void;
  readOnly?: boolean;
  maxQuantity: number;
  showBillingStatus?: boolean;
}

const OrdemEntregas: React.FC<OrdemEntregasProps> = ({ 
  entregas, 
  onAddEntrega, 
  onRemoveEntrega, 
  readOnly, 
  maxQuantity, 
  showBillingStatus = false 
}) => {
  // Estado local para o formulário de nova entrega
  const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().split('T')[0]);
  const [quantidade, setQuantidade] = useState<string>('');
  const [statusFaturamento, setStatusFaturamento] = useState('nao_faturado');
  const [docRef, setDocRef] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cálculos dinâmicos
  const totalEntregue = useMemo(() => {
    return entregas.reduce((acc, item) => acc + Number(item.quantidade_entregue), 0);
  }, [entregas]);

  const saldoRestante = Math.max(0, maxQuantity - totalEntregue);

  const validateAndAdd = () => {
    setError(null);
    const qtdNum = Number(quantidade);

    if (!quantidade || isNaN(qtdNum) || qtdNum <= 0) {
      setError('Informe uma quantidade válida maior que zero.');
      return;
    }

    if (qtdNum > saldoRestante) {
      setError(`A quantidade não pode exceder o saldo restante (${saldoRestante}).`);
      return;
    }

    if (!dataEntrega) {
      setError('A data da entrega é obrigatória.');
      return;
    }

    const novaEntrega: Partial<OrdemEntrega> = {
      data_entrega: dataEntrega,
      quantidade_entregue: qtdNum,
      status_faturamento: statusFaturamento,
      documento_ref: docRef,
      documento_entrega: showBillingStatus ? docRef : undefined,
      observacoes: observacoes,
    };

    onAddEntrega(novaEntrega);

    // Reset form
    setQuantidade('');
    setDocRef('');
    setObservacoes('');
    setStatusFaturamento('nao_faturado');
  };

  return (
    <Section title="Entregas Realizadas" description="Registre as entregas parciais ou finais desta ordem.">
        <div className="sm:col-span-6 space-y-6">
            
            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                    <span className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Planejado</span>
                    <span className="text-3xl font-bold text-blue-800">{maxQuantity}</span>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col items-center justify-center">
                    <span className="text-xs text-green-600 font-bold uppercase tracking-wider mb-1">Total Entregue</span>
                    <span className="text-3xl font-bold text-green-800">{totalEntregue}</span>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col items-center justify-center ${saldoRestante === 0 ? 'bg-gray-100 border-gray-200' : 'bg-orange-50 border-orange-100'}`}>
                    <span className={`text-xs font-bold uppercase tracking-wider mb-1 ${saldoRestante === 0 ? 'text-gray-500' : 'text-orange-600'}`}>Saldo Restante</span>
                    <span className={`text-3xl font-bold ${saldoRestante === 0 ? 'text-gray-600' : 'text-orange-800'}`}>{saldoRestante}</span>
                </div>
            </div>

            {/* Formulário de Adição */}
            {!readOnly && saldoRestante > 0 && (
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-600" />
                        Nova Entrega
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                        <div className="sm:col-span-3">
                            <Input 
                                label="Data" 
                                name="data_entrega" 
                                type="date" 
                                value={dataEntrega} 
                                onChange={e => setDataEntrega(e.target.value)} 
                            />
                        </div>
                        <div className="sm:col-span-3">
                            <Input 
                                label="Quantidade" 
                                name="qtd" 
                                type="number" 
                                value={quantidade} 
                                onChange={e => setQuantidade(e.target.value)} 
                                placeholder={`Máx: ${saldoRestante}`}
                                min={0}
                                max={saldoRestante}
                            />
                        </div>
                        
                        {showBillingStatus && (
                            <div className="sm:col-span-3">
                                <Select 
                                    label="Faturamento" 
                                    name="status_fat" 
                                    value={statusFaturamento} 
                                    onChange={e => setStatusFaturamento(e.target.value)}
                                >
                                    <option value="nao_faturado">Não Faturado</option>
                                    <option value="pronto_para_faturar">Pronto p/ Faturar</option>
                                    <option value="faturado">Faturado</option>
                                </Select>
                            </div>
                        )}

                        <div className={showBillingStatus ? "sm:col-span-3" : "sm:col-span-6"}>
                             <Input 
                                label="Documento / Ref." 
                                name="doc_ref" 
                                value={docRef} 
                                onChange={e => setDocRef(e.target.value)} 
                                placeholder="Ex: NF 123"
                            />
                        </div>

                        <div className="sm:col-span-10">
                            <Input 
                                label="Observações" 
                                name="obs" 
                                value={observacoes} 
                                onChange={e => setObservacoes(e.target.value)} 
                                placeholder="Detalhes adicionais..."
                            />
                        </div>

                        <div className="sm:col-span-2 flex items-end h-full pb-[1px]">
                            <button 
                                onClick={validateAndAdd}
                                className="w-full bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-95"
                            >
                                <Plus size={18} />
                                Adicionar
                            </button>
                        </div>
                    </div>

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }} 
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 p-2 rounded-md border border-red-100"
                        >
                            <AlertCircle size={16} />
                            {error}
                        </motion.div>
                    )}
                </div>
            )}

            {/* Tabela de Entregas */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
                            {showBillingStatus && <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Fat.</th>}
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Obs.</th>
                            {!readOnly && <th scope="col" className="px-4 py-3 text-right w-16"></th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        <AnimatePresence>
                            {entregas.map((entrega) => (
                                <motion.tr 
                                    key={entrega.id}
                                    layout
                                    initial={{ opacity: 0, backgroundColor: "#f0f9ff" }}
                                    animate={{ opacity: 1, backgroundColor: "#ffffff" }}
                                    exit={{ opacity: 0, backgroundColor: "#fef2f2" }}
                                    transition={{ duration: 0.3 }}
                                    className="hover:bg-gray-50"
                                >
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-gray-400" />
                                            {new Date(entrega.data_entrega).toLocaleDateString('pt-BR')}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-gray-800">
                                        {entrega.quantidade_entregue}
                                    </td>
                                    {showBillingStatus && (
                                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                entrega.status_faturamento === 'faturado' ? 'bg-green-100 text-green-800' :
                                                entrega.status_faturamento === 'pronto_para_faturar' ? 'bg-blue-100 text-blue-800' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {entrega.status_faturamento === 'nao_faturado' ? 'Não Faturado' : 
                                                entrega.status_faturamento === 'pronto_para_faturar' ? 'Pronto' : 'Faturado'}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {showBillingStatus
                                          ? (entrega.documento_entrega || entrega.documento_ref || '-')
                                          : (entrega.documento_ref || entrega.documento_entrega || '-')}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-xs">
                                        {entrega.observacoes || '-'}
                                    </td>
                                    {!readOnly && (
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <button 
                                                onClick={() => onRemoveEntrega(entrega.id)} 
                                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                                title="Remover entrega"
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
                                <td colSpan={showBillingStatus ? 6 : 5} className="px-6 py-10 text-center text-gray-500">
                                    <Package className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                                    <p>Nenhuma entrega registrada ainda.</p>
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
