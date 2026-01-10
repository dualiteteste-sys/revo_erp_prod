import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import {
    getRecebimento,
    listRecebimentoItens,
    conferirItem,
    finalizarRecebimentoV2,
    setRecebimentoClassificacao,
    syncMateriaisClienteFromRecebimento,
    updateRecebimentoItemProduct,
    updateRecebimentoCustos,
    Recebimento,
    RecebimentoItem,
} from '@/services/recebimento';
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle, Save, Layers, RefreshCw, Hammer, ScanLine } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { ActionLockedError, runWithActionLock } from '@/lib/actionLock';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import Modal from '@/components/ui/Modal';
import { searchClients } from '@/services/clients';
import PartnerFormPanel from '@/components/partners/PartnerFormPanel';
import { saveOrdem } from '@/services/industria';
import { ensureMaterialClienteV2 } from '@/services/industriaMateriais';
import QuickScanModal from '@/components/ui/QuickScanModal';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

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
    const [custos, setCustos] = useState<{
        custo_frete: number;
        custo_seguro: number;
        custo_impostos: number;
        custo_outros: number;
        rateio_base: 'valor' | 'quantidade';
    }>({ custo_frete: 0, custo_seguro: 0, custo_impostos: 0, custo_outros: 0, rateio_base: 'valor' });
    const [savingCustos, setSavingCustos] = useState(false);
    const [isScanOpen, setIsScanOpen] = useState(false);
    const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
    const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
    const [sort, setSort] = useState<SortState<string>>({ column: 'produto_xml', direction: 'asc' });
    const [obSort, setObSort] = useState<SortState<string>>({ column: 'produto_xml', direction: 'asc' });

    const itensColumns: TableColumnWidthDef[] = [
        { id: 'produto_xml', defaultWidth: 380, minWidth: 240 },
        { id: 'produto_sistema', defaultWidth: 420, minWidth: 240 },
        { id: 'qtd_nota', defaultWidth: 140, minWidth: 120 },
        { id: 'qtd_conferida', defaultWidth: 160, minWidth: 140 },
        { id: 'status', defaultWidth: 160, minWidth: 140 },
        { id: 'acoes', defaultWidth: 220, minWidth: 180 },
    ];
    const gerarObColumns: TableColumnWidthDef[] = [
        { id: 'gerar', defaultWidth: 90, minWidth: 80 },
        { id: 'produto_xml', defaultWidth: 360, minWidth: 220 },
        { id: 'produto_sistema', defaultWidth: 360, minWidth: 220 },
        { id: 'qtd', defaultWidth: 160, minWidth: 140 },
    ];
    const { widths: itensWidths, startResize: startResizeItens } = useTableColumnWidths({ tableId: 'suprimentos:conferencia:itens', columns: itensColumns });
    const { widths: gerarObWidths, startResize: startResizeGerarOb } = useTableColumnWidths({ tableId: 'suprimentos:conferencia:gerar-ob', columns: gerarObColumns });

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

    const sortedItens = useMemo(() => {
        return sortRows(
            itens,
            sort as any,
            [
                { id: 'produto_xml', type: 'string', getValue: (i) => i.fiscal_nfe_import_items?.xprod ?? '' },
                { id: 'produto_sistema', type: 'string', getValue: (i) => i.produtos?.nome ?? '' },
                { id: 'qtd_nota', type: 'number', getValue: (i) => Number(i.quantidade_xml ?? 0) },
                { id: 'qtd_conferida', type: 'number', getValue: (i) => Number(i.quantidade_conferida ?? 0) },
                { id: 'status', type: 'string', getValue: (i) => String(i.status ?? '') },
            ] as const
        );
    }, [itens, sort]);

    const sortedGerarObItens = useMemo(() => {
        const base = itens.map((it) => {
            const qty = (it.quantidade_conferida && it.quantidade_conferida > 0) ? it.quantidade_conferida : it.quantidade_xml;
            const disabled = !it.produto_id;
            return { it, qty, disabled };
        });
        return sortRows(
            base,
            obSort as any,
            [
                { id: 'produto_xml', type: 'string', getValue: (r) => r.it.fiscal_nfe_import_items?.xprod ?? '' },
                { id: 'produto_sistema', type: 'string', getValue: (r) => r.it.produtos?.nome ?? '' },
                { id: 'qtd', type: 'number', getValue: (r) => Number(r.qty ?? 0) },
            ] as const
        );
    }, [itens, obSort]);

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
            setCustos({
                custo_frete: Number(recData?.custo_frete ?? 0),
                custo_seguro: Number(recData?.custo_seguro ?? 0),
                custo_impostos: Number(recData?.custo_impostos ?? 0),
                custo_outros: Number(recData?.custo_outros ?? 0),
                rateio_base: (recData?.rateio_base === 'quantidade' ? 'quantidade' : 'valor') as any,
            });
        } catch (error) {
            console.error(error);
            addToast('Erro ao carregar dados do recebimento.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleConferencia = async (itemId: string, qtd: number, opts?: { silentToast?: boolean }) => {
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
            if (!opts?.silentToast) addToast('Quantidade registrada.', 'success');
        } catch (error) {
            // Revert on error
            setItens(previousItens);
            addToast('Erro ao salvar conferência.', 'error');
        } finally {
            setSaving(null);
        }
    };

    const focusAndHighlightItem = (itemId: string) => {
        const el = rowRefs.current[itemId];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setHighlightItemId(itemId);
        window.setTimeout(() => setHighlightItemId((v) => (v === itemId ? null : v)), 1800);
    };

    const normalizeScan = (value: string) => value.trim();
    const digitsOnlyScan = (value: string) => value.replace(/\D/g, '');

    const findItemByScan = (raw: string) => {
        const scan = normalizeScan(raw);
        const scanUpper = scan.toUpperCase();
        const scanDigits = digitsOnlyScan(scan);

        const byEan = scanDigits
            ? itens.find((it) => digitsOnlyScan(it.fiscal_nfe_import_items?.ean || '') === scanDigits)
            : null;
        if (byEan) return byEan;

        const byCprod = itens.find((it) => (it.fiscal_nfe_import_items?.cprod || '').toUpperCase() === scanUpper);
        if (byCprod) return byCprod;

        const bySku = itens.find((it) => (it.produtos?.sku || '').toUpperCase() === scanUpper);
        if (bySku) return bySku;

        return null;
    };

    const handleScanResult = async (text: string) => {
        const item = findItemByScan(text);
        if (!item) {
            addToast('Não encontrei este código na lista de itens do recebimento.', 'warning');
            return;
        }

        setIsScanOpen(false);
        focusAndHighlightItem(item.id);

        if (recebimento?.status === 'concluido' || recebimento?.status === 'cancelado') {
            addToast('Este recebimento está concluído/cancelado. A conferência não pode ser alterada.', 'info');
            return;
        }

        const current = Number(item.quantidade_conferida || 0);
        const target = Math.min(current + 1, Number(item.quantidade_xml || 0));
        if (target === current) {
            addToast('Este item já está conferido na quantidade da nota.', 'info');
            return;
        }

        try {
            const promise = handleConferencia(item.id, target, { silentToast: true });
            lastSavePromiseRef.current = promise;
            await promise;
            addToast(
                `Conferido: ${item.produtos?.nome || item.fiscal_nfe_import_items?.xprod || 'Item'} (${target}/${item.quantidade_xml})`,
                'success'
            );
        } catch {
            // handleConferencia já mostra toast de erro
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

            const result = await runWithActionLock(`recebimento:finalizar:${id}`, async () => {
                return await finalizarRecebimentoV2(id);
            });
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
            if (error instanceof ActionLockedError) {
                addToast('Já estamos finalizando este recebimento. Aguarde alguns segundos.', 'info');
            } else {
                console.error(error);
                addToast((error as any)?.message || 'Erro ao finalizar recebimento.', 'error');
            }
        } finally {
            setFinalizing(false);
        }
    };

    const totalAdicional = useMemo(() => {
        return (custos.custo_frete || 0) + (custos.custo_seguro || 0) + (custos.custo_impostos || 0) + (custos.custo_outros || 0);
    }, [custos]);

    const handleSaveCustos = async () => {
        if (!id) return;
        if (savingCustos) return;
        if (!recebimento) return;
        if (recebimento.status === 'concluido' || recebimento.status === 'cancelado') {
            addToast('Este recebimento já foi finalizado/cancelado. Ajuste os custos antes de finalizar.', 'warning');
            return;
        }

        setSavingCustos(true);
        try {
            const updated = await runWithActionLock(`recebimento:custos:${id}`, async () => {
                return await updateRecebimentoCustos(id, {
                    custo_frete: Number(custos.custo_frete || 0),
                    custo_seguro: Number(custos.custo_seguro || 0),
                    custo_impostos: Number(custos.custo_impostos || 0),
                    custo_outros: Number(custos.custo_outros || 0),
                    rateio_base: custos.rateio_base,
                });
            });
            setRecebimento(updated);
            addToast('Custos adicionais atualizados. Eles serão considerados no custo médio ao finalizar.', 'success');
        } catch (e: any) {
            console.error(e);
            addToast(e?.message || 'Erro ao salvar custos.', 'error');
        } finally {
            setSavingCustos(false);
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
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700"
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

            {!isDetailsView && (
                <div className="mb-6 rounded-2xl border border-white/50 bg-white/70 backdrop-blur-md p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Custo adicional (landed cost)</div>
                            <div className="mt-1 text-xs text-slate-600">
                                Rateie frete/seguro/impostos/outros para refletir o custo real no estoque e nos relatórios. Ajuste antes de finalizar.
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleSaveCustos}
                            disabled={savingCustos || recebimento.status === 'concluido' || recebimento.status === 'cancelado'}
                            className={`inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 ${
                                savingCustos || recebimento.status === 'concluido' || recebimento.status === 'cancelado'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                            }`}
                        >
                            {savingCustos ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                            Salvar custos
                        </button>
                    </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-1">
                            <label htmlFor="rec-custo-frete" className="block text-xs font-semibold text-slate-700">
                                Frete
                            </label>
                            <input
                                id="rec-custo-frete"
                                type="number"
                                step="0.01"
                                min="0"
                                value={custos.custo_frete}
                                onChange={(e) => setCustos((p) => ({ ...p, custo_frete: Number(e.target.value || 0) }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <label htmlFor="rec-custo-seguro" className="block text-xs font-semibold text-slate-700">
                                Seguro
                            </label>
                            <input
                                id="rec-custo-seguro"
                                type="number"
                                step="0.01"
                                min="0"
                                value={custos.custo_seguro}
                                onChange={(e) => setCustos((p) => ({ ...p, custo_seguro: Number(e.target.value || 0) }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <label htmlFor="rec-custo-impostos" className="block text-xs font-semibold text-slate-700">
                                Impostos
                            </label>
                            <input
                                id="rec-custo-impostos"
                                type="number"
                                step="0.01"
                                min="0"
                                value={custos.custo_impostos}
                                onChange={(e) => setCustos((p) => ({ ...p, custo_impostos: Number(e.target.value || 0) }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                        <div className="sm:col-span-1">
                            <label htmlFor="rec-custo-outros" className="block text-xs font-semibold text-slate-700">
                                Outros
                            </label>
                            <input
                                id="rec-custo-outros"
                                type="number"
                                step="0.01"
                                min="0"
                                value={custos.custo_outros}
                                onChange={(e) => setCustos((p) => ({ ...p, custo_outros: Number(e.target.value || 0) }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor="rec-rateio-base" className="block text-xs font-semibold text-slate-700">
                                Base do rateio
                            </label>
                            <select
                                id="rec-rateio-base"
                                value={custos.rateio_base}
                                onChange={(e) => setCustos((p) => ({ ...p, rateio_base: e.target.value === 'quantidade' ? 'quantidade' : 'valor' }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-blue-400"
                            >
                                <option value="valor">Proporcional ao valor dos itens (recomendado)</option>
                                <option value="quantidade">Proporcional à quantidade</option>
                            </select>
                            <div className="mt-2 text-xs text-slate-600">
                                Total adicional: <span className="font-semibold">R$ {totalAdicional.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                    <div className="flex flex-col gap-2 border-b border-gray-100 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">Conferência rápida (WMS light)</div>
                            <div className="text-xs text-gray-500">
                                Escaneie EAN/SKU/Cód. do item para localizar e somar na conferência (sem passar do XML).
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsScanOpen(true)}
                            disabled={!recebimento || recebimento.status === 'concluido' || recebimento.status === 'cancelado'}
                            className={`inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 ${
                                !recebimento || recebimento.status === 'concluido' || recebimento.status === 'cancelado'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                            }`}
                            title="Escanear um código para localizar e conferir rapidamente"
                        >
                            <ScanLine size={16} />
                            Escanear código
                        </button>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200">
                        <TableColGroup columns={itensColumns} widths={itensWidths} />
                        <thead className="bg-gray-50">
                            <tr>
                                <ResizableSortableTh columnId="produto_xml" label="Produto (XML)" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeItens as any} />
                                <ResizableSortableTh columnId="produto_sistema" label="Produto (Sistema)" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeItens as any} />
                                <ResizableSortableTh columnId="qtd_nota" label="Qtd. Nota" align="right" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeItens as any} />
                                <ResizableSortableTh columnId="qtd_conferida" label="Qtd. Conferida" align="right" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeItens as any} />
                                <ResizableSortableTh columnId="status" label="Status" align="center" sort={sort as any} onSort={(col) => setSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeItens as any} />
                                <ResizableSortableTh columnId="acoes" label="Ações" align="center" sortable={false} resizable onResizeStart={startResizeItens as any} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {sortedItens.map(item => (
                                <tr
                                    key={item.id}
                                    ref={(el) => {
                                        rowRefs.current[item.id] = el;
                                    }}
                                    className={[
                                        item.status === 'divergente' && item.quantidade_conferida > 0 ? 'bg-red-50' : '',
                                        highlightItemId === item.id ? 'ring-2 ring-blue-400 ring-inset' : '',
                                    ].join(' ')}
                                >
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
                                                ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50' 
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

            <QuickScanModal
                isOpen={isScanOpen}
                onClose={() => setIsScanOpen(false)}
                title="Escanear item do recebimento"
                helper="Escaneie o EAN/SKU/Código do item. O sistema localiza o item no XML e soma 1 na conferência (até a quantidade da nota)."
                confirmLabel="Usar"
                onResult={handleScanResult}
            />

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
                                <TableColGroup columns={gerarObColumns} widths={gerarObWidths} />
                                <thead className="bg-white sticky top-0">
                                    <tr>
                                        <ResizableSortableTh
                                            columnId="gerar"
                                            label="Gerar"
                                            className="px-4 py-3 text-xs font-semibold"
                                            sortable={false}
                                            resizable
                                            onResizeStart={startResizeGerarOb as any}
                                        />
                                        <ResizableSortableTh
                                            columnId="produto_xml"
                                            label="Produto (XML)"
                                            className="px-4 py-3 text-xs font-semibold"
                                            sort={obSort as any}
                                            onSort={(col) => setObSort((prev) => toggleSort(prev as any, col))}
                                            onResizeStart={startResizeGerarOb as any}
                                        />
                                        <ResizableSortableTh
                                            columnId="produto_sistema"
                                            label="Produto (Sistema)"
                                            className="px-4 py-3 text-xs font-semibold"
                                            sort={obSort as any}
                                            onSort={(col) => setObSort((prev) => toggleSort(prev as any, col))}
                                            onResizeStart={startResizeGerarOb as any}
                                        />
                                        <ResizableSortableTh
                                            columnId="qtd"
                                            label="Qtd (conf.)"
                                            align="right"
                                            className="px-4 py-3 text-xs font-semibold"
                                            sort={obSort as any}
                                            onSort={(col) => setObSort((prev) => toggleSort(prev as any, col))}
                                            onResizeStart={startResizeGerarOb as any}
                                        />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {sortedGerarObItens.map(({ it, qty, disabled }) => {
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
                            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
