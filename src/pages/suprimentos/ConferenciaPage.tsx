import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRecebimento, listRecebimentoItens, conferirItem, finalizarRecebimento, updateRecebimentoItemProduct, Recebimento, RecebimentoItem } from '@/services/recebimento';
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle, Save, Layers } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';

export default function ConferenciaPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [recebimento, setRecebimento] = useState<Recebimento | null>(null);
    const [itens, setItens] = useState<RecebimentoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null); // ID do item sendo salvo

    useEffect(() => {
        if (id) loadData(id);
    }, [id]);

    const loadData = async (recId: string) => {
        setLoading(true);
        try {
            const [recData, itensData] = await Promise.all([
                getRecebimento(recId),
                listRecebimentoItens(recId)
            ]);
            setRecebimento(recData);
            setItens(itensData);
        } catch (error) {
            console.error(error);
            addToast('Erro ao carregar dados do recebimento.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleConferencia = async (itemId: string, qtd: number) => {
        setSaving(itemId);

        // Optimistic Update: Update UI immediately
        const previousItens = [...itens];
        setItens(prev => prev.map(item =>
            item.id === itemId
                ? { ...item, quantidade_conferida: qtd, status: qtd >= item.quantidade_xml ? 'ok' : 'divergente' }
                : item
        ));

        try {
            await conferirItem(itemId, qtd);
            addToast('Quantidade registrada.', 'success');
        } catch (error) {
            // Revert on error
            setItens(previousItens);
            addToast('Erro ao salvar conferência.', 'error');
        } finally {
            setSaving(null);
        }
    };

    const handleFinalizar = async () => {
        if (!id) return;

        // Verifica se há pendências
        const pendentes = itens.filter(i => i.quantidade_conferida === 0);
        if (pendentes.length > 0) {
            if (!confirm(`Existem ${pendentes.length} itens com quantidade zero. Deseja continuar mesmo assim?`)) return;
        }

        try {
            const result = await finalizarRecebimento(id);
            if (result.status === 'concluido') {
                addToast(result.message, 'success');
                // Recarrega para atualizar o status e habilitar os botões
                loadData(id);
            } else {
                addToast(result.message, 'warning');
                loadData(id);
            }
        } catch (error) {
            addToast('Erro ao finalizar recebimento.', 'error');
        }
    };

    const handleGerarOB = (item: RecebimentoItem) => {
        if (!recebimento) return;
        
        if (!item.produto_id) {
            addToast('Vincule um produto do sistema antes de gerar a OB.', 'warning');
            return;
        }

        navigate('/app/industria/beneficiamento', {
            state: {
                createFromRecebimento: {
                    recebimento: {
                        numero: recebimento.fiscal_nfe_imports?.numero,
                        serie: recebimento.fiscal_nfe_imports?.serie,
                        emitente_nome: recebimento.fiscal_nfe_imports?.emitente_nome,
                        emitente_cnpj: recebimento.fiscal_nfe_imports?.emitente_cnpj, // Passando CNPJ
                    },
                    item: {
                        produto_id: item.produto_id,
                        produto_nome: item.produtos?.nome,
                        quantidade: item.quantidade_conferida > 0 ? item.quantidade_conferida : item.quantidade_xml,
                        unidade: item.produtos?.unidade || 'UN'
                    }
                }
            }
        });
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>;
    if (!recebimento) return <div className="p-12 text-center">Recebimento não encontrado.</div>;

    const isConcluido = recebimento.status === 'concluido';

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate('/app/suprimentos/recebimentos')} className="p-2 hover:bg-gray-100 rounded-full">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Conferência de Recebimento</h1>
                    <p className="text-gray-600">
                        Nota: {recebimento.fiscal_nfe_imports?.numero} - {recebimento.fiscal_nfe_imports?.emitente_nome}
                    </p>
                </div>
                <div className="ml-auto">
                    {!isConcluido && (
                        <button
                            onClick={handleFinalizar}
                            disabled={saving !== null}
                            className={`bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 ${saving !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {saving !== null ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                            Finalizar Recebimento
                        </button>
                    )}
                    {isConcluido && (
                        <span className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                            <CheckCircle size={20} />
                            Recebimento Concluído
                        </span>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto (XML)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto (Sistema)</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd. Nota</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd. Conferida</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {itens.map(item => (
                            <tr key={item.id} className={item.status === 'divergente' && item.quantidade_conferida > 0 ? 'bg-red-50' : ''}>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{item.fiscal_nfe_import_items?.xprod}</div>
                                    <div className="text-xs text-gray-500">Cód: {item.fiscal_nfe_import_items?.cprod}</div>
                                </td>
                                <td className="px-6 py-4">
                                    {item.produtos ? (
                                        <>
                                            <div className="text-gray-900">{item.produtos.nome}</div>
                                            <div className="text-xs text-gray-500">{item.produtos.sku}</div>
                                        </>
                                    ) : (
                                        <div className="w-full max-w-xs">
                                            <ItemAutocomplete
                                                onSelect={async (prod) => {
                                                    try {
                                                        await updateRecebimentoItemProduct(item.id, prod.id);
                                                        // Update local state
                                                        setItens(prev => prev.map(i =>
                                                            i.id === item.id
                                                                ? { ...i, produto_id: prod.id, produtos: { nome: prod.descricao, sku: prod.sku || null, unidade: prod.unidade || 'UN' } }
                                                                : i
                                                        ));
                                                        addToast('Produto vinculado com sucesso!', 'success');
                                                    } catch (e) {
                                                        addToast('Erro ao vincular produto.', 'error');
                                                    }
                                                }}
                                                placeholder="Vincular produto..."
                                                onlySales={false}
                                                type="product"
                                                disabled={isConcluido}
                                            />
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-gray-700">
                                    {item.quantidade_xml}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {isConcluido ? (
                                        <span className="font-bold">{item.quantidade_conferida}</span>
                                    ) : (
                                        <input
                                            type="number"
                                            className="w-24 p-2 border rounded text-right focus:ring-2 focus:ring-blue-500"
                                            defaultValue={item.quantidade_conferida}
                                            onBlur={(e) => handleConferencia(item.id, Number(e.target.value))}
                                        />
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {item.status === 'ok' && <CheckCircle className="mx-auto text-green-500" size={20} />}
                                    {item.status === 'divergente' && item.quantidade_conferida > 0 && <AlertTriangle className="mx-auto text-red-500" size={20} />}
                                    {item.status === 'pendente' && <span className="text-gray-400">-</span>}
                                    {saving === item.id && <Loader2 className="mx-auto animate-spin text-blue-500" size={20} />}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={() => handleGerarOB(item)}
                                        disabled={!isConcluido}
                                        className={`p-2 rounded-lg transition-colors flex items-center gap-1 mx-auto text-xs font-medium ${
                                            isConcluido 
                                            ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-50' 
                                            : 'text-gray-400 cursor-not-allowed'
                                        }`}
                                        title={isConcluido ? "Gerar Ordem de Beneficiamento" : "Finalize a conferência para gerar OB"}
                                    >
                                        <Layers size={16} />
                                        Gerar OB
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
