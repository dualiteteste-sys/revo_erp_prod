import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Search, Link2, Plus } from 'lucide-react';
import { ExtratoItem, Movimentacao, listMovimentacoes, saveMovimentacao } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import Input from '@/components/ui/forms/Input';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  extratoItem: ExtratoItem | null;
  contaCorrenteId: string;
  onConciliate: (movimentacaoId: string) => Promise<void>;
}

export default function ConciliacaoDrawer({ isOpen, onClose, extratoItem, contaCorrenteId, onConciliate }: Props) {
  const { addToast } = useToast();
  const [movements, setMovements] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && extratoItem) {
      fetchSuggestions();
    }
  }, [isOpen, extratoItem]);

  const fetchSuggestions = async () => {
    if (!extratoItem) return;
    setLoading(true);
    try {
      // Search movements around the date (+- 5 days)
      const date = new Date(extratoItem.data_lancamento);
      const startDate = new Date(date); startDate.setDate(date.getDate() - 5);
      const endDate = new Date(date); endDate.setDate(date.getDate() + 5);

      const { data } = await listMovimentacoes({
        contaCorrenteId,
        startDate,
        endDate,
        tipoMov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
        page: 1,
        pageSize: 50
      });
      
      // Client-side filter for unconciliated and exact amount match priority
      const unconciliated = data.filter(m => !m.conciliado);
      
      // Sort: Exact amount match first, then date proximity
      unconciliated.sort((a, b) => {
        const diffA = Math.abs(a.valor - extratoItem.valor);
        const diffB = Math.abs(b.valor - extratoItem.valor);
        if (diffA !== diffB) return diffA - diffB;
        return new Date(b.data_movimento).getTime() - new Date(a.data_movimento).getTime();
      });

      setMovements(unconciliated);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndConciliate = async () => {
    if (!extratoItem) return;
    setIsCreating(true);
    try {
      const newMov = await saveMovimentacao({
        conta_corrente_id: contaCorrenteId,
        data_movimento: extratoItem.data_lancamento,
        tipo_mov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
        valor: extratoItem.valor,
        descricao: extratoItem.descricao,
        documento_ref: extratoItem.documento_ref,
        origem_tipo: 'conciliacao_automatica',
        observacoes: 'Gerado via conciliação bancária'
      });
      
      await onConciliate(newMov.id);
      addToast('Movimentação criada e conciliada!', 'success');
      onClose();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLink = async (movId: string) => {
    if (!extratoItem) return;
    if (linkingId) return;
    setLinkingId(movId);
    try {
      await onConciliate(movId);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao conciliar.', 'error');
    } finally {
      setLinkingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-md bg-white h-full shadow-2xl pointer-events-auto flex flex-col"
      >
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-800">Conciliar Lançamento</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-6 bg-blue-50 border-b border-blue-100">
            <p className="text-xs text-blue-600 font-bold uppercase mb-1">Item do Extrato</p>
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-800 text-lg">{extratoItem?.descricao}</span>
                <span className={`font-bold text-lg ${extratoItem?.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                    R$ {extratoItem?.valor.toFixed(2)}
                </span>
            </div>
            <div className="flex justify-between text-sm text-blue-800">
                <span>{new Date(extratoItem!.data_lancamento).toLocaleDateString('pt-BR')}</span>
                <span>Doc: {extratoItem?.documento_ref || '-'}</span>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-gray-700">Movimentações Sugeridas</h4>
                <button
                  onClick={fetchSuggestions}
                  disabled={loading || !!linkingId}
                  className="text-blue-600 text-xs hover:underline disabled:opacity-60"
                >
                  Atualizar
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" /></div>
            ) : movements.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                    <p>Nenhuma movimentação compatível encontrada.</p>
                    <button 
                        onClick={handleCreateAndConciliate}
                        disabled={isCreating}
                        className="mt-4 text-blue-600 font-semibold hover:underline flex items-center justify-center gap-1 mx-auto"
                    >
                        {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                        Criar Movimentação Igual
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {movements.map(mov => {
                        const isExactMatch = mov.valor === extratoItem?.valor;
                        const isLinking = linkingId === mov.id;
                        return (
                            <div key={mov.id} className={`p-3 border rounded-lg hover:border-blue-400 cursor-pointer transition-colors ${isExactMatch ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-medium text-gray-800">{mov.descricao}</span>
                                    <span className={`font-bold ${mov.tipo_mov === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                        R$ {mov.valor.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                                    <span>{new Date(mov.data_movimento).toLocaleDateString('pt-BR')}</span>
                                    {isExactMatch && <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Valor Exato</span>}
                                </div>
                                <button 
                                    onClick={() => void handleLink(mov.id)}
                                    disabled={!!linkingId}
                                    className="w-full py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isLinking ? <Loader2 className="animate-spin" size={14} /> : <Link2 size={14} />} Vincular
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            
            {movements.length > 0 && (
                 <div className="mt-6 pt-6 border-t">
                    <button 
                        onClick={handleCreateAndConciliate}
                        disabled={isCreating || !!linkingId}
                        className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                    >
                        {isCreating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                        Não encontrou? Criar Nova Movimentação
                    </button>
                 </div>
            )}
        </div>
      </motion.div>
    </div>
  );
}
