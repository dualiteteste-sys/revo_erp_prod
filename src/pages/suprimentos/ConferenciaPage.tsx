import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { getRecebimento, listRecebimentoItens, conferirItem, finalizarRecebimentoV2, setRecebimentoClassificacao, syncMateriaisClienteFromRecebimento, updateRecebimentoItemProduct, Recebimento, RecebimentoItem } from '@/services/recebimento';
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle, Save, Layers, RefreshCw, Hammer } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import Modal from '@/components/ui/Modal';
import { searchClients } from '@/services/clients';
import PartnerFormPanel from '@/components/partners/PartnerFormPanel';
import { saveOrdem } from '@/services/industria';
import { ensureMaterialClienteV2 } from '@/services/industriaMateriais';

export default function ConferenciaPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [recebimento, setRecebimento] = useState<Recebimento | null>(null);
    const [itens, setItens] = useState<RecebimentoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null); // ID do item sendo salvo
    const lastSavePromiseRef = useRef<Promise<void> | null>(null);
    const [finalizing, setFinalizing] = useState(false);
    const [isClassificacaoOpen, setIsClassificacaoOpen] = useState(false);
    const [classificacao, setClassificacao] = useState<'estoque_proprio' | 'material_cliente'>('estoque_proprio');
    const [classificacaoClienteId, setClassificacaoClienteId] = useState<string | null>(null);
    const [classificacaoClienteNome, setClassificacaoClienteNome] = useState<string | undefined>(undefined);
    const [classificando, setClassificando] = useState(false);
    const [resolvendoSugestao, setResolvendoSugestao] = useState(false);
    const [isCreateClienteOpen, setIsCreateClienteOpen] = useState(false);
    const [syncingMateriaisCliente, setSyncingMateriaisCliente] = useState(false);
    const [showItens, setShowItens] = useState(true);
    const [isGerarObOpen, setIsGerarObOpen] = useState(false);
    const [gerarObPedido, setGerarObPedido] = useState('');
    const [gerarObSelecionados, setGerarObSelecionados] = useState<Record<string, boolean>>({});
    const [gerarObLoading, setGerarObLoading] = useState(false);

    const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

    const clienteXmlSugestao = useMemo(() => {
        const nome = recebimento?.fiscal_nfe_imports?.emitente_nome || null;
        const cnpj = recebimento?.fiscal_nfe_imports?.emitente_cnpj || null;
        const doc = digitsOnly(cnpj);
        if (!nome && !doc) return null;
        return { nome, doc };
    }, [recebimento]);

    const clienteXmlPrefill = useMemo(() => {
        if (!clienteXmlSugestao) return null;
        const docLen = (clienteXmlSugestao.doc || '').length;
        const tipoPessoa = docLen === 11 ? 'fisica' : docLen === 14 ? 'juridica' : 'juridica';
        return {
            tipo: 'cliente' as any,
            tipo_pessoa: tipoPessoa as any,
            nome: clienteXmlSugestao.nome || '',
            doc_unico: clienteXmlSugestao.doc || null,
        };
    }, [clienteXmlSugestao]);

    useEffect(() => {
        if (id) loadData(id);
    }, [id]);

    const detailsViewParam = useMemo(() => new URLSearchParams(location.search).get('view') === 'details', [location.search]);

    useEffect(() => {
        if (detailsViewParam && recebimento?.status === 'concluido') {
            setShowItens(false);
        }
    }, [detailsViewParam, recebimento?.status]);

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
        if (finalizing) return;
        if (recebimento?.status === 'cancelado') {
            addToast('Recebimento cancelado não pode ser finalizado.', 'warning');
            return;
        }

        // Verifica se há pendências
        const pendentes = itens.filter(i => i.quantidade_conferida === 0);
        if (pendentes.length > 0) {
            const ok = await confirm({
                title: 'Finalizar recebimento',
                description: `Existem ${pendentes.length} itens com quantidade zero. Deseja continuar mesmo assim?`,
                confirmText: 'Continuar',
                cancelText: 'Cancelar',
                variant: 'primary',
            });
            if (!ok) return;
        }

        setFinalizing(true);
        try {
            // Se o usuário clicar no botão enquanto um input está com foco,
            // o blur pode disparar uma conferência e marcar `saving` antes do click ser processado.
            // Para evitar precisar de 2 cliques, aguardamos qualquer salvamento pendente.
            await lastSavePromiseRef.current;

            const result = await finalizarRecebimentoV2(id);
            if (result.status === 'pendente_classificacao') {
                setIsClassificacaoOpen(true);
                addToast(result.message, 'warning');
                return;
            }
            if (result.status === 'pendente_vinculos') {
                addToast(result.message, 'warning');
                return;
            }
            if (result.status === 'concluido') {
                addToast(result.message, 'success');
                const syncStatus = result.materiais_cliente_sync?.status;
                if (syncStatus && syncStatus !== 'ok') {
                    showMateriaisClienteSyncToast(result.materiais_cliente_sync);
                }
                // Recarrega para atualizar o status e habilitar os botões
                loadData(id);
            } else {
                addToast(result.message, 'warning');
                loadData(id);
            }
        } catch (error) {
            console.error(error);
            addToast((error as any)?.message || 'Erro ao finalizar recebimento.', 'error');
        } finally {
            setFinalizing(false);
        }
    };

    const showMateriaisClienteSyncToast = (sync: { status?: string; reason?: string; error?: string; upserted?: number }) => {
        const syncStatus = String(sync?.status || '');
        if (syncStatus === 'ok') {
            const upserted = Number(sync?.upserted || 0);
            addToast(
                upserted > 0
                    ? `Materiais de Clientes sincronizados (${upserted}).`
                    : 'Materiais de Clientes sincronizados.',
                'success'
            );
            return;
        }

        const syncReason = String(sync?.reason || '');
        const syncError = String(sync?.error || '');
        const reasonLabel =
            syncReason === 'emitente_cnpj_missing'
                ? 'O XML não possui CNPJ do emitente.'
                : syncReason === 'cliente_not_set'
                    ? 'Defina o cliente/dono do material (classificação) e tente novamente.'
                : syncReason === 'cliente_upsert_failed'
                    ? 'Falha ao criar/atualizar automaticamente o cliente do XML.'
                : syncReason === 'industria_materiais_cliente_missing'
                    ? 'Módulo/tabela de Materiais de Clientes não está disponível no banco.'
                : syncReason === 'pessoas_missing'
                    ? 'Tabela de clientes/parceiros não está disponível no banco.'
                : syncReason
                    ? `Motivo: ${syncReason}`
                    : 'Verifique o cadastro do cliente.';

        addToast(
            `Materiais de Clientes não foram sincronizados automaticamente. ${reasonLabel}${
                syncError ? ` (Detalhe técnico: ${syncError})` : ''
            }`,
            'warning'
        );
    };

    const handleResyncMateriaisCliente = async () => {
        if (!id) return;
        if (syncingMateriaisCliente) return;

        setSyncingMateriaisCliente(true);
        try {
            const sync = await syncMateriaisClienteFromRecebimento(id);
            showMateriaisClienteSyncToast(sync);
        } catch (e: any) {
            console.error(e);
            addToast(e.message || 'Erro ao sincronizar Materiais de Clientes.', 'error');
        } finally {
            setSyncingMateriaisCliente(false);
        }
    };

    const handleConfirmarClassificacao = async () => {
        if (!id) return;
        if (classificacao === 'material_cliente' && !classificacaoClienteId) {
            addToast('Selecione o cliente/dono do material.', 'error');
            return;
        }

        setClassificando(true);
        try {
            await setRecebimentoClassificacao(id, classificacao, classificacao === 'material_cliente' ? classificacaoClienteId : null);
            setIsClassificacaoOpen(false);
            addToast('Classificação salva. Finalizando...', 'success');
            await handleFinalizar();
        } catch (e: any) {
            console.error(e);
            addToast(e.message || 'Erro ao classificar recebimento.', 'error');
        } finally {
            setClassificando(false);
        }
    };

    const handleUsarSugestaoClienteXml = async () => {
        if (!clienteXmlSugestao) return;
        if (resolvendoSugestao) return;

        setResolvendoSugestao(true);
        try {
            const q = clienteXmlSugestao.doc || clienteXmlSugestao.nome || '';
            const hits = await searchClients(q, 10);

            const exact =
                (clienteXmlSugestao.doc
                    ? hits.find(h => digitsOnly(h.doc_unico) === clienteXmlSugestao.doc)
                    : null) || hits[0];

            if (!exact) {
                setIsCreateClienteOpen(true);
                return;
            }

            setClassificacaoClienteId(exact.id);
            setClassificacaoClienteNome(exact.nome || exact.label);
            addToast('Sugestão aplicada ao cliente do material.', 'success');
        } catch (e: any) {
            console.error(e);
            addToast(e.message || 'Erro ao buscar cliente sugerido.', 'error');
        } finally {
            setResolvendoSugestao(false);
        }
    };

    const handleGerarOP = (item: RecebimentoItem) => {
        if (!recebimento) return;
        
        if (!item.produto_id) {
            addToast('Vincule um produto do sistema antes de gerar a OP.', 'warning');
            return;
        }

        if (recebimento.classificacao === 'material_cliente') {
            // Estado da arte: gera Beneficiamento (OB) no próprio fluxo de Recebimento.
            setGerarObSelecionados({ [item.id]: true });
            setGerarObPedido(recebimento.fiscal_nfe_imports?.pedido_numero || '');
            setIsGerarObOpen(true);
            return;
        }

        addToast('Redirecionando para criar uma Ordem de Produção.', 'info');

        navigate('/app/industria/producao', {
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

    const handleOpenGerarOb = () => {
        if (!recebimento) return;
        const pre: Record<string, boolean> = {};
        for (const it of itens) {
            if (it.produto_id) pre[it.id] = true;
        }
        setGerarObSelecionados(pre);
        setGerarObPedido(recebimento.fiscal_nfe_imports?.pedido_numero || '');
        setIsGerarObOpen(true);
    };

    const buildDocumentoRef = (rec: Recebimento) => {
        const numero = rec.fiscal_nfe_imports?.numero || '';
        const serie = rec.fiscal_nfe_imports?.serie || '';
        const chave = rec.fiscal_nfe_imports?.chave_acesso || '';
        const documentoRef = `NF-e ${numero}${serie ? `/${serie}` : ''}${chave ? ` — ${chave}` : ''}`.trim();
        return documentoRef || null;
    };

    const handleGerarObConfirm = async () => {
        if (!recebimento) return;
        if (recebimento.status !== 'concluido') {
            addToast('Finalize o recebimento antes de gerar a OB.', 'warning');
            return;
        }
        if (recebimento.classificacao !== 'material_cliente') {
            addToast('Este recebimento não está classificado como Material do Cliente.', 'warning');
            return;
        }
        if (!recebimento.cliente_id) {
            addToast('Defina o cliente (dono do material) na classificação do recebimento.', 'warning');
            return;
        }

        const selected = itens.filter(it => gerarObSelecionados[it.id]);
        const invalid = selected.filter(it => !it.produto_id);
        if (invalid.length > 0) {
            addToast('Há itens sem produto vinculado. Vincule todos antes de gerar a OB.', 'warning');
            return;
        }

        const ok = await confirm({
            title: 'Gerar Ordens de Beneficiamento',
            description: `Gerar ${selected.length} ordem(ns) a partir deste recebimento?`,
            confirmText: 'Gerar OB',
            cancelText: 'Cancelar',
            variant: 'primary',
        });
        if (!ok) return;

        setGerarObLoading(true);
        try {
            const documentoRef = buildDocumentoRef(recebimento);
            const numeroNf = recebimento.fiscal_nfe_imports?.numero || null;
            const pedido = gerarObPedido.trim() || null;

            const createdIds: string[] = [];
            for (const it of selected) {
                const produtoId = it.produto_id!;
                const qty = (it.quantidade_conferida && it.quantidade_conferida > 0) ? it.quantidade_conferida : it.quantidade_xml;
                const unidadeXml = it.fiscal_nfe_import_items?.ucom || null;
                const unidade = (unidadeXml || it.produtos?.unidade || 'UN').toString();

                const materialClienteId = await ensureMaterialClienteV2(
                    recebimento.cliente_id,
                    produtoId,
                    it.produtos?.nome || 'Material',
                    unidade,
                    {
                        codigoCliente: it.fiscal_nfe_import_items?.cprod || null,
                        nomeCliente: it.fiscal_nfe_import_items?.xprod || null,
                    }
                );

                const saved = await saveOrdem({
                    tipo_ordem: 'beneficiamento',
                    status: 'rascunho',
                    cliente_id: recebimento.cliente_id,
                    produto_final_id: produtoId,
                    quantidade_planejada: qty,
                    unidade,
                    usa_material_cliente: true,
                    material_cliente_id: materialClienteId,
                    documento_ref: documentoRef,
                    numero_nf: numeroNf,
                    pedido_numero: pedido,
                    origem_fiscal_nfe_import_id: recebimento.fiscal_nfe_import_id,
                    origem_fiscal_nfe_item_id: it.fiscal_nfe_item_id,
                    origem_qtd_xml: qty,
                    origem_unidade_xml: unidadeXml || unidade,
                });

                createdIds.push(saved.id);
            }

            addToast(`OB(s) gerada(s): ${createdIds.length}.`, 'success');
            setIsGerarObOpen(false);
            navigate('/app/industria/ordens?tipo=beneficiamento');
        } catch (e: any) {
            const msg = String(e?.message || '');
            if (/duplicate key value violates unique constraint/i.test(msg) || /ux_industria_ordens_origem_item/i.test(msg)) {
                addToast('Já existe uma Ordem de Beneficiamento para algum item selecionado desta NF-e.', 'warning');
            } else {
                addToast(msg || 'Erro ao gerar Ordens de Beneficiamento.', 'error');
            }
        } finally {
            setGerarObLoading(false);
        }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>;
    if (!recebimento) return <div className="p-12 text-center">Recebimento não encontrado.</div>;

    const isConcluido = recebimento.status === 'concluido';
    const isCancelado = recebimento.status === 'cancelado';
    const isLocked = isConcluido || isCancelado;
    const isDetailsView = (isConcluido || isCancelado) && detailsViewParam;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate('/app/suprimentos/recebimentos')} className="p-2 hover:bg-gray-100 rounded-full">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {isConcluido ? 'Detalhes do Recebimento' : 'Conferência de Recebimento'}
                    </h1>
                    <p className="text-gray-600">
                        Nota: {recebimento.fiscal_nfe_imports?.numero} - {recebimento.fiscal_nfe_imports?.emitente_nome}
                    </p>
                </div>
                <div className="ml-auto">
                    {!isLocked && (
                        <button
                            onClick={handleFinalizar}
                            disabled={finalizing}
                            className={`bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 ${finalizing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {finalizing ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                            Finalizar Recebimento
                        </button>
                    )}
                    {isLocked && (
                        <div className="flex items-center gap-2">
                            {isConcluido && recebimento?.classificacao === 'material_cliente' && (
                                <button
                                    type="button"
                                    onClick={handleResyncMateriaisCliente}
                                    disabled={syncingMateriaisCliente}
                                    className={`bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-200 ${
                                        syncingMateriaisCliente ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                                    title="Tentar novamente sincronizar Materiais de Clientes deste recebimento"
                                >
                                    {syncingMateriaisCliente ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                                    Sincronizar Materiais
                                </button>
                            )}
                            {isConcluido && recebimento?.classificacao === 'material_cliente' && (
                                <button
                                    type="button"
                                    onClick={handleOpenGerarOb}
                                    className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700"
                                    title="Gerar Ordem(s) de Beneficiamento a partir deste recebimento"
                                >
                                    <Hammer size={18} />
                                    Gerar OB(s)
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowItens(v => !v)}
                                className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-bold hover:bg-gray-200"
                                title={showItens ? 'Ocultar itens do recebimento' : 'Mostrar itens do recebimento'}
                            >
                                {showItens ? 'Ocultar Itens' : 'Mostrar Itens'}
                            </button>
                            {isConcluido ? (
                                <span className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                                    <CheckCircle size={20} />
                                    Recebimento Concluído
                                </span>
                            ) : (
                                <span className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                                    <AlertTriangle size={20} />
                                    Recebimento Cancelado
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isDetailsView && (
                isConcluido ? (
                    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
                        <div className="font-semibold">Recebimento concluído</div>
                        <div className="text-sm text-green-800">
                            A conferência já foi realizada no fluxo anterior. Aqui você pode apenas consultar os detalhes.
                        </div>
                    </div>
                ) : (
                    <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-900">
                        <div className="font-semibold">Recebimento cancelado</div>
                        <div className="text-sm text-orange-800">
                            Este recebimento foi cancelado (estornado). Não é possível editar ou finalizar.
                        </div>
                    </div>
                )
            )}

            {showItens && (
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
                                                    disabled={isLocked}
                                                />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-700">
                                        {item.quantidade_xml}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isLocked ? (
                                            <span className="font-bold">{item.quantidade_conferida}</span>
                                        ) : (
                                            <input
                                                type="number"
                                                className="w-24 p-2 border rounded text-right focus:ring-2 focus:ring-blue-500"
                                                defaultValue={item.quantidade_conferida}
                                                onBlur={(e) => {
                                                    const promise = handleConferencia(item.id, Number(e.target.value));
                                                    lastSavePromiseRef.current = promise;
                                                }}
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
                                            onClick={() => handleGerarOP(item)}
                                            disabled={!isConcluido}
                                            className={`p-2 rounded-lg transition-colors flex items-center gap-1 mx-auto text-xs font-medium ${
                                                isConcluido 
                                                ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-50' 
                                                : 'text-gray-400 cursor-not-allowed'
                                            }`}
                                            title={
                                                !isConcluido
                                                    ? 'Finalize a conferência para gerar a ordem'
                                                    : (recebimento?.classificacao === 'material_cliente'
                                                        ? 'Gerar Ordem de Beneficiamento'
                                                        : 'Gerar Ordem de Produção')
                                            }
                                        >
                                            <Layers size={16} />
                                            {recebimento?.classificacao === 'material_cliente' ? 'Gerar OB' : 'Gerar OP'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                isOpen={isGerarObOpen}
                onClose={() => setIsGerarObOpen(false)}
                title="Gerar Ordens de Beneficiamento"
                size="4xl"
            >
                <div className="p-6 space-y-5">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="text-sm font-semibold text-gray-800">Origem</div>
                        <div className="mt-2 text-sm text-gray-700">
                            <div><span className="font-medium">NF:</span> {recebimento?.fiscal_nfe_imports?.numero || '—'} / {recebimento?.fiscal_nfe_imports?.serie || '—'}</div>
                            <div><span className="font-medium">Emitente:</span> {recebimento?.fiscal_nfe_imports?.emitente_nome || '—'}</div>
                            <div className="mt-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Pedido do cliente (opcional)</label>
                                <input
                                    value={gerarObPedido}
                                    onChange={(e) => setGerarObPedido(e.target.value)}
                                    className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition shadow-sm"
                                    placeholder="Ex.: 12345"
                                />
                                <div className="mt-1 text-xs text-gray-500">
                                    Dica: se o XML trouxer o pedido, ele será sugerido automaticamente aqui.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">Itens</div>
                        <div className="max-h-[55vh] overflow-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-white sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Gerar</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto (XML)</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto (Sistema)</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd (conf.)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {itens.map((it) => {
                                        const qty = (it.quantidade_conferida && it.quantidade_conferida > 0) ? it.quantidade_conferida : it.quantidade_xml;
                                        const disabled = !it.produto_id;
                                        return (
                                            <tr key={it.id} className={disabled ? 'bg-gray-50' : ''}>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!gerarObSelecionados[it.id]}
                                                        onChange={(e) => setGerarObSelecionados(prev => ({ ...prev, [it.id]: e.target.checked }))}
                                                        disabled={disabled}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-800">
                                                    <div className="font-medium">{it.fiscal_nfe_import_items?.xprod || '—'}</div>
                                                    <div className="text-xs text-gray-500">Cód: {it.fiscal_nfe_import_items?.cprod || '—'}</div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-800">
                                                    {it.produtos?.nome || <span className="text-gray-400">Vincule um produto</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800">
                                                    {qty} <span className="text-xs text-gray-500">{it.fiscal_nfe_import_items?.ucom || it.produtos?.unidade || ''}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setIsGerarObOpen(false)}
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            disabled={gerarObLoading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleGerarObConfirm}
                            className="flex items-center gap-2 bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            disabled={gerarObLoading}
                        >
                            {gerarObLoading ? <Loader2 className="animate-spin" size={18} /> : <Hammer size={18} />}
                            Gerar OB(s)
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isClassificacaoOpen}
                onClose={() => setIsClassificacaoOpen(false)}
                title="Classificar recebimento"
                size="md"
            >
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600">
                        Antes de concluir, escolha o destino do estoque. Você pode classificar como <b>Estoque Próprio</b> (venda) ou <b>Material do Cliente</b> (beneficiamento).
                    </p>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                checked={classificacao === 'estoque_proprio'}
                                onChange={() => setClassificacao('estoque_proprio')}
                            />
                            <span className="text-sm font-medium text-gray-800">Estoque Próprio (para venda)</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                checked={classificacao === 'material_cliente'}
                                onChange={() => setClassificacao('material_cliente')}
                            />
                            <span className="text-sm font-medium text-gray-800">Material do Cliente (não vender)</span>
                        </label>
                    </div>

                    {classificacao === 'material_cliente' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (dono do material)</label>
                            <ClientAutocomplete
                                value={classificacaoClienteId}
                                onChange={(id, name) => {
                                    setClassificacaoClienteId(id);
                                    setClassificacaoClienteNome(name);
                                }}
                                initialName={classificacaoClienteNome}
                            />
                            {clienteXmlSugestao && (
                                <button
                                    type="button"
                                    onClick={handleUsarSugestaoClienteXml}
                                    disabled={resolvendoSugestao}
                                    className="mt-2 w-full text-left rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                                    title="Clique para usar o cliente do XML como sugestão"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <span className="font-semibold">Sugestão do XML:</span>{' '}
                                            <span className="truncate">
                                                {clienteXmlSugestao.nome || 'Cliente do XML'}
                                            </span>
                                            {clienteXmlSugestao.doc ? (
                                                <span className="text-gray-500"> — {clienteXmlSugestao.doc}</span>
                                            ) : null}
                                        </div>
                                        {resolvendoSugestao ? (
                                            <Loader2 className="animate-spin flex-shrink-0" size={14} />
                                        ) : (
                                            <span className="text-blue-700 font-semibold flex-shrink-0">Usar</span>
                                        )}
                                    </div>
                                </button>
                            )}
                            <p className="text-xs text-gray-500 mt-1">Use quando o material é de terceiros para beneficiamento.</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => setIsClassificacaoOpen(false)}
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmarClassificacao}
                            disabled={classificando}
                            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {classificando ? <Loader2 className="animate-spin" size={18} /> : null}
                            Confirmar
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isCreateClienteOpen}
                onClose={() => setIsCreateClienteOpen(false)}
                title="Novo Cliente"
                size="4xl"
            >
                <PartnerFormPanel
                    partner={null}
                    initialValues={clienteXmlPrefill || undefined}
                    onSaveSuccess={(savedPartner: any) => {
                        setClassificacaoClienteId(savedPartner.id);
                        setClassificacaoClienteNome(savedPartner.nome);
                        setIsCreateClienteOpen(false);
                        addToast('Cliente criado e selecionado!', 'success');
                    }}
                    onClose={() => setIsCreateClienteOpen(false)}
                />
            </Modal>
        </div>
    );
}
