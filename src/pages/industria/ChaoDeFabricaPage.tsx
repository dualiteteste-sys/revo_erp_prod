import React, { useState, useEffect } from 'react';
import { listMinhaFila, OperacaoFila, apontarExecucao } from '@/services/industriaExecucao';
import { listCentrosTrabalho, CentroTrabalho } from '@/services/industriaCentros';
import { Loader2, Play, Pause, CheckCircle, AlertTriangle, User, Package } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';

export default function ChaoDeFabricaPage() {
  const { addToast } = useToast();
  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const [selectedCentroId, setSelectedCentroId] = useState<string>('');
  const [fila, setFila] = useState<OperacaoFila[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<OperacaoFila | null>(null);

  // Modal de Apontamento
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'pausar' | 'concluir' | null>(null);
  const [qtdBoas, setQtdBoas] = useState<number>(0);
  const [qtdRefugadas, setQtdRefugadas] = useState<number>(0);
  const [motivoRefugo, setMotivoRefugo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listCentrosTrabalho(undefined, true).then(data => {
        setCentros(data);
        if (data.length > 0) setSelectedCentroId(data[0].id);
    });
  }, []);

  const fetchFila = async () => {
    if (!selectedCentroId) return;
    setLoading(true);
    try {
      const data = await listMinhaFila(selectedCentroId);
      setFila(data);
      // Se a operação selecionada ainda estiver na fila, atualiza seus dados
      if (selectedOp) {
        const updated = data.find(op => op.id === selectedOp.id);
        setSelectedOp(updated || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFila();
    // Reset selection when changing center
    setSelectedOp(null);
  }, [selectedCentroId]);

  const handleStart = async () => {
    if (!selectedOp) return;
    try {
        await apontarExecucao(selectedOp.id, 'iniciar');
        addToast('Operação iniciada.', 'success');
        fetchFila();
    } catch (e: any) {
        addToast(e.message, 'error');
    }
  };

  const openModal = (action: 'pausar' | 'concluir') => {
    setModalAction(action);
    setQtdBoas(0);
    setQtdRefugadas(0);
    setMotivoRefugo('');
    setObservacoes('');
    setIsModalOpen(true);
  };

  const handleConfirmApontamento = async () => {
    if (!selectedOp || !modalAction) return;
    setIsSaving(true);
    try {
        await apontarExecucao(selectedOp.id, modalAction, qtdBoas, qtdRefugadas, motivoRefugo, observacoes);
        addToast(`Operação ${modalAction === 'pausar' ? 'pausada' : 'concluída'}.`, 'success');
        setIsModalOpen(false);
        fetchFila();
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Chão de Fábrica - Minha Fila</h1>
        <select 
            value={selectedCentroId} 
            onChange={e => setSelectedCentroId(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg bg-white shadow-sm min-w-[250px]"
        >
            <option value="">Selecione o Centro de Trabalho</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      {!selectedCentroId ? (
        <div className="flex-grow flex items-center justify-center text-gray-500">
            Selecione um centro de trabalho para visualizar a fila.
        </div>
      ) : (
        <div className="flex-grow flex gap-6 overflow-hidden">
            {/* Lista da Fila (Esquerda) */}
            <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-styled">
                {loading && fila.length === 0 ? (
                    <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-blue-500" /></div>
                ) : fila.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Fila vazia.</div>
                ) : (
                    fila.map(op => (
                        <div 
                            key={op.id}
                            onClick={() => setSelectedOp(op)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                selectedOp?.id === op.id 
                                    ? 'bg-blue-50 border-blue-500 shadow-md' 
                                    : 'bg-white border-gray-200 hover:border-blue-300'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-gray-800">#{op.ordem_numero}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${
                                    op.status === 'em_execucao' ? 'bg-green-100 text-green-800' : 
                                    op.status === 'em_espera' ? 'bg-orange-100 text-orange-800' : 
                                    'bg-gray-100 text-gray-600'
                                }`}>
                                    {op.status.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <p className="text-sm font-medium text-gray-700 line-clamp-2 mb-2">{op.produto_nome}</p>
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Plan: {op.quantidade_planejada}</span>
                                <span>Prod: {op.quantidade_produzida}</span>
                            </div>
                            {op.atrasada && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-bold">
                                    <AlertTriangle size={12} /> Atrasada
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Detalhe da Operação (Direita) */}
            <div className="w-2/3">
                {selectedOp ? (
                    <GlassCard className="h-full flex flex-col p-6">
                        <div className="border-b border-gray-200 pb-4 mb-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-1">Ordem #{selectedOp.ordem_numero}</h2>
                                    <p className="text-lg text-gray-600">{selectedOp.produto_nome}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-500">Prioridade</p>
                                    <p className="text-xl font-bold text-blue-600">{selectedOp.prioridade}</p>
                                </div>
                            </div>
                            {selectedOp.cliente_nome && (
                                <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                                    <User size={16} /> {selectedOp.cliente_nome}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-gray-50 p-4 rounded-lg text-center border border-gray-200">
                                <p className="text-xs text-gray-500 uppercase font-bold">Planejado</p>
                                <p className="text-2xl font-bold text-gray-800">{selectedOp.quantidade_planejada}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
                                <p className="text-xs text-green-600 uppercase font-bold">Produzido</p>
                                <p className="text-2xl font-bold text-green-700">{selectedOp.quantidade_produzida}</p>
                            </div>
                            <div className="bg-red-50 p-4 rounded-lg text-center border border-red-200">
                                <p className="text-xs text-red-600 uppercase font-bold">Refugo</p>
                                <p className="text-2xl font-bold text-red-700">{selectedOp.quantidade_refugada}</p>
                            </div>
                        </div>

                        <div className="flex-grow bg-yellow-50 rounded-lg p-4 border border-yellow-100 mb-6">
                            <h4 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
                                <AlertTriangle size={18} /> Instruções de Trabalho
                            </h4>
                            <p className="text-sm text-yellow-900">
                                Verifique as especificações da ficha técnica antes de iniciar. 
                                Utilize os EPIs obrigatórios.
                                (Placeholder para instruções reais do roteiro)
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mt-auto">
                            <button
                                onClick={handleStart}
                                disabled={selectedOp.status === 'em_execucao' || selectedOp.status === 'concluida'}
                                className="flex flex-col items-center justify-center gap-2 bg-blue-600 text-white p-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Play size={32} />
                                <span className="font-bold">INICIAR</span>
                            </button>
                            <button
                                onClick={() => openModal('pausar')}
                                disabled={selectedOp.status !== 'em_execucao'}
                                className="flex flex-col items-center justify-center gap-2 bg-orange-500 text-white p-4 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Pause size={32} />
                                <span className="font-bold">PAUSAR</span>
                            </button>
                            <button
                                onClick={() => openModal('concluir')}
                                disabled={selectedOp.status === 'concluida'}
                                className="flex flex-col items-center justify-center gap-2 bg-green-600 text-white p-4 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle size={32} />
                                <span className="font-bold">CONCLUIR</span>
                            </button>
                        </div>
                    </GlassCard>
                ) : (
                    <div className="h-full flex items-center justify-center bg-white rounded-2xl border border-gray-200 text-gray-400">
                        <div className="text-center">
                            <Package size={64} className="mx-auto mb-4 opacity-20" />
                            <p>Selecione uma operação na fila para ver detalhes.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalAction === 'pausar' ? 'Apontar Parada' : 'Apontar Conclusão'} size="md">
        <div className="p-6 space-y-4">
            <Input 
                label="Quantidade Boa" 
                name="qtdBoas" 
                type="number" 
                value={qtdBoas} 
                onChange={e => setQtdBoas(parseFloat(e.target.value))} 
            />
            <Input 
                label="Quantidade Refugada" 
                name="qtdRefugadas" 
                type="number" 
                value={qtdRefugadas} 
                onChange={e => setQtdRefugadas(parseFloat(e.target.value))} 
            />
            {qtdRefugadas > 0 && (
                <Input 
                    label="Motivo do Refugo" 
                    name="motivo" 
                    value={motivoRefugo} 
                    onChange={e => setMotivoRefugo(e.target.value)} 
                />
            )}
            <TextArea 
                label="Observações" 
                name="obs" 
                value={observacoes} 
                onChange={e => setObservacoes(e.target.value)} 
                rows={3} 
            />
            <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancelar</button>
                <button 
                    onClick={handleConfirmApontamento} 
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {isSaving && <Loader2 className="animate-spin" size={16} />}
                    Confirmar
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
}
