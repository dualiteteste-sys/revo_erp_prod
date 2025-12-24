import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Save, TriangleAlert, XCircle } from 'lucide-react';
import { OrdemIndustriaDetails, OrdemPayload, saveOrdem, getOrdemDetails, manageComponente, manageEntrega, OrdemEntrega, gerarExecucaoOrdem, cloneOrdem } from '@/services/industria';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import MaterialClienteAutocomplete from '@/components/industria/materiais/MaterialClienteAutocomplete';
import OrdemFormItems from './OrdemFormItems';
import OrdemEntregas from './OrdemEntregas';
import BomSelector from './BomSelector';
import RoteiroSelector from './RoteiroSelector';
import { formatOrderNumber } from '@/lib/utils';
import { listMateriaisCliente, type MaterialClienteListItem } from '@/services/industriaMateriais';
import { useNavigate } from 'react-router-dom';
import Modal from '@/components/ui/Modal';
import { logger } from '@/lib/logger';
import IndustriaAuditTrailPanel from '@/components/industria/audit/IndustriaAuditTrailPanel';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import ImportarXmlSuprimentosModal from '@/components/industria/materiais/ImportarXmlSuprimentosModal';

interface Props {
  ordemId: string | null;
  initialTipoOrdem?: 'industrializacao' | 'beneficiamento';
  initialPrefill?: {
    clienteId?: string | null;
    clienteNome?: string | null;
    clienteDoc?: string | null;
    produtoId?: string | null;
    produtoNome?: string | null;
    quantidade?: number | null;
    unidade?: string | null;
    documentoRef?: string | null;
    materialClienteNome?: string | null;
    materialClienteCodigo?: string | null;
    materialClienteUnidade?: string | null;
    origemNfeImportId?: string | null;
    origemNfeItemId?: string | null;
    origemQtdXml?: number | null;
    origemUnidadeXml?: string | null;
  };
  allowTipoOrdemChange?: boolean;
  onTipoOrdemChange?: (tipo: 'industrializacao' | 'beneficiamento') => void;
  onSaveSuccess: () => void;
  onOpenOrder?: (ordemId: string) => void;
  onClose: () => void;
}

export default function OrdemFormPanel({
  ordemId,
  initialTipoOrdem,
  initialPrefill,
  allowTipoOrdemChange,
  onTipoOrdemChange,
  onSaveSuccess,
  onOpenOrder,
  onClose,
}: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const empresaRoleQuery = useEmpresaRole();
  const empresaRole = empresaRoleQuery.data;
  // Enquanto o role não carregou, não travar o formulário (evita "race condition" de empresa/role).
  const canEdit = empresaRoleQuery.isFetched ? roleAtLeast(empresaRole, 'member') : true;
  const canAdmin = empresaRoleQuery.isFetched ? roleAtLeast(empresaRole, 'admin') : false;
  const [loading, setLoading] = useState(!!ordemId);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingExecucao, setIsGeneratingExecucao] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes' | 'entregas' | 'historico'>('dados');
  const [highlightComponenteId, setHighlightComponenteId] = useState<string | null>(null);
  const [highlightEntregaId, setHighlightEntregaId] = useState<string | null>(null);
  const [materialRefreshToken, setMaterialRefreshToken] = useState<number>(0);
  const [showImportXmlModal, setShowImportXmlModal] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [showGerarExecucaoModal, setShowGerarExecucaoModal] = useState(false);

  const [formData, setFormData] = useState<Partial<OrdemIndustriaDetails>>({
    status: 'rascunho',
    tipo_ordem: initialTipoOrdem || 'industrializacao',
    prioridade: 0,
    unidade: 'un',
    quantidade_planejada: 0,
    componentes: [],
    entregas: []
  });

  useEffect(() => {
    if (ordemId) return;
    if (!initialTipoOrdem) return;
    setFormData(prev => ({ ...prev, tipo_ordem: initialTipoOrdem }));
  }, [initialTipoOrdem, ordemId]);

  useEffect(() => {
    if (ordemId) return;
    if (!initialPrefill) return;

    setFormData(prev => {
      const next: Partial<OrdemIndustriaDetails> = { ...prev };

      if (initialPrefill.clienteId && !next.cliente_id) {
        next.cliente_id = initialPrefill.clienteId;
      }
      if (initialPrefill.clienteNome && !next.cliente_nome) {
        next.cliente_nome = initialPrefill.clienteNome;
      }
      if (initialPrefill.produtoId && !next.produto_final_id) {
        next.produto_final_id = initialPrefill.produtoId;
      }
      if (initialPrefill.produtoNome && !next.produto_nome) {
        next.produto_nome = initialPrefill.produtoNome;
      }
      if (typeof initialPrefill.quantidade === 'number' && (!next.quantidade_planejada || next.quantidade_planejada <= 0)) {
        next.quantidade_planejada = initialPrefill.quantidade;
      }
      if (initialPrefill.unidade && (!next.unidade || next.unidade === 'un')) {
        next.unidade = initialPrefill.unidade;
      }
      if (initialPrefill.documentoRef && !next.documento_ref) {
        next.documento_ref = initialPrefill.documentoRef;
      }

      if (initialPrefill.origemNfeImportId && !next.origem_fiscal_nfe_import_id) {
        next.origem_fiscal_nfe_import_id = initialPrefill.origemNfeImportId;
      }
      if (initialPrefill.origemNfeItemId && !next.origem_fiscal_nfe_item_id) {
        next.origem_fiscal_nfe_item_id = initialPrefill.origemNfeItemId;
      }
      if (typeof initialPrefill.origemQtdXml === 'number' && next.origem_qtd_xml == null) {
        next.origem_qtd_xml = initialPrefill.origemQtdXml;
        if (!next.quantidade_planejada || next.quantidade_planejada <= 0) {
          next.quantidade_planejada = initialPrefill.origemQtdXml;
        }
      }
      if (initialPrefill.origemUnidadeXml && !next.origem_unidade_xml) {
        next.origem_unidade_xml = initialPrefill.origemUnidadeXml;
        if (!next.unidade || next.unidade === 'un') {
          next.unidade = initialPrefill.origemUnidadeXml;
        }
      }

      if (initialTipoOrdem === 'beneficiamento' || next.tipo_ordem === 'beneficiamento') {
        if (initialPrefill.materialClienteNome && !next.material_cliente_nome) {
          next.material_cliente_nome = initialPrefill.materialClienteNome;
        }
        if (initialPrefill.materialClienteCodigo && !next.material_cliente_codigo) {
          next.material_cliente_codigo = initialPrefill.materialClienteCodigo;
        }
        if (initialPrefill.materialClienteUnidade && !next.material_cliente_unidade) {
          next.material_cliente_unidade = initialPrefill.materialClienteUnidade;
        }
      }

      return next;
    });
  }, [initialPrefill, initialTipoOrdem, ordemId]);

  useEffect(() => {
    if (ordemId) {
      loadDetails();
    }
  }, [ordemId]);

  const loadDetails = async (idOverride?: string) => {
    // FIX: Use idOverride or formData.id if ordemId is null (newly created order)
    const idToLoad = idOverride || ordemId || formData.id;
    if (!idToLoad) return;

    try {
      const data = await getOrdemDetails(idToLoad);
      setFormData(data);
    } catch (e) {
      logger.error('[Indústria][OP/OB] Falha ao carregar ordem', e, { ordemId: idToLoad });
      addToast('Erro ao carregar ordem.', 'error');
      if (ordemId) onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof OrdemPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelect = (item: any) => {
    handleHeaderChange('produto_final_id', item.id);
    handleHeaderChange('produto_nome', item.descricao);
    handleHeaderChange('usa_material_cliente', false);
    handleHeaderChange('material_cliente_id', null);
    handleHeaderChange('material_cliente_nome', null);
    handleHeaderChange('material_cliente_codigo', null);
    handleHeaderChange('material_cliente_unidade', null);
  };

	  const handleSaveHeader = async () => {
	    if (!canEdit) {
	      addToast('Você não tem permissão para editar esta ordem.', 'error');
	      return null;
	    }
	    if (formData.status === 'concluida' || formData.status === 'cancelada') {
	      addToast('Esta ordem está bloqueada para edição.', 'error');
	      return null;
	    }
	    if (formData.tipo_ordem === 'beneficiamento' && !formData.cliente_id) {
	      addToast('Para beneficiamento, selecione o cliente.', 'error');
	      return null;
	    }
	    if (formData.tipo_ordem === 'beneficiamento' && !formData.material_cliente_id) {
	      addToast('Para beneficiamento, selecione o Material do Cliente (ou importe o XML / cadastre o material).', 'error');
	      return null;
	    }
	    if (!formData.produto_final_id) {
	      addToast('Selecione um produto final.', 'error');
	      return null;
	    }
	    if (!formData.quantidade_planejada || formData.quantidade_planejada <= 0) {
      addToast('A quantidade planejada deve ser maior que zero.', 'error');
      return null;
    }

	    setIsSaving(true);
	    try {
	      let materialClienteId = formData.material_cliente_id || null;
	      let usaMaterialCliente = !!formData.usa_material_cliente;

	      if (formData.tipo_ordem === 'beneficiamento') {
	        if (!formData.cliente_id) {
	          addToast('Beneficiamento: selecione o cliente antes de salvar.', 'error');
	          setIsSaving(false);
	          return null;
	        }
	        if (!materialClienteId) {
	          addToast('Beneficiamento: selecione o Material do Cliente antes de salvar.', 'error');
	          setIsSaving(false);
	          return null;
	        }
	        usaMaterialCliente = true;
	      }

      const payload: OrdemPayload = {
        id: formData.id,
        tipo_ordem: formData.tipo_ordem,
        produto_final_id: formData.produto_final_id,
        quantidade_planejada: formData.quantidade_planejada,
        unidade: formData.unidade,
        cliente_id: formData.cliente_id,
        usa_material_cliente: usaMaterialCliente,
        material_cliente_id: materialClienteId,
        status: formData.status,
        prioridade: formData.prioridade,
        data_prevista_inicio: formData.data_prevista_inicio,
        data_prevista_fim: formData.data_prevista_fim,
        data_prevista_entrega: formData.data_prevista_entrega,
        documento_ref: formData.documento_ref,
        observacoes: formData.observacoes,
        roteiro_aplicado_id: formData.roteiro_aplicado_id,
        roteiro_aplicado_desc: formData.roteiro_aplicado_desc,
        qtde_caixas: formData.qtde_caixas,
        numero_nf: formData.numero_nf,
        pedido_numero: formData.pedido_numero,
        origem_fiscal_nfe_import_id: formData.origem_fiscal_nfe_import_id,
        origem_fiscal_nfe_item_id: formData.origem_fiscal_nfe_item_id,
        origem_qtd_xml: formData.origem_qtd_xml,
        origem_unidade_xml: formData.origem_unidade_xml,
      };

      const saved = await saveOrdem(payload);
      setFormData(prev => ({ ...prev, ...saved }));

      if (!formData.id) {
        addToast('Ordem criada! Configure os componentes.', 'success');
        setActiveTab('componentes');
        // Para beneficiamento, mantém o fluxo igual ao de produção (BOM/roteiro só na aba dedicada).
      } else {
        addToast('Ordem salva.', 'success');
      }
      onSaveSuccess();
      return saved.id;
    } catch (e: any) {
      addToast(e.message, 'error');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const ensureOrderSaved = async (): Promise<string | null> => {
    if (formData.id) return formData.id;
    const createdId = await handleSaveHeader();
    return createdId || null;
  };

  const materialClienteValue: MaterialClienteListItem | null = formData.tipo_ordem === 'beneficiamento' &&
    formData.material_cliente_id &&
    formData.cliente_id &&
    formData.produto_final_id
    ? {
        id: formData.material_cliente_id,
        cliente_id: formData.cliente_id,
        cliente_nome: formData.cliente_nome || '',
        produto_id: formData.produto_final_id!,
        produto_nome: formData.produto_nome || '',
        codigo_cliente: formData.material_cliente_codigo ?? null,
        nome_cliente: formData.material_cliente_nome ?? null,
        unidade: formData.material_cliente_unidade ?? null,
        ativo: true,
        total_count: 1,
      }
    : null;

  // --- Componentes ---
  const handleAddComponente = async (item: any) => {
    if (!canEdit) {
      addToast('Você não tem permissão para editar esta ordem.', 'error');
      return;
    }
    let currentId = formData.id;
    if (!currentId) {
      currentId = await handleSaveHeader();
      if (!currentId) return;
    }

    try {
      await manageComponente(currentId!, null, item.id, 1, 'un', 'upsert');
      await loadDetails(currentId);
      addToast('Componente adicionado.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveComponente = async (itemId: string) => {
    if (!canEdit) {
      addToast('Você não tem permissão para editar esta ordem.', 'error');
      return;
    }
    try {
      await manageComponente(formData.id!, itemId, '', 0, '', 'delete');
      await loadDetails(formData.id);
      addToast('Componente removido.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleUpdateComponente = async (itemId: string, field: string, value: any) => {
    if (!canEdit) {
      addToast('Você não tem permissão para editar esta ordem.', 'error');
      return;
    }
    const item = formData.componentes?.find(c => c.id === itemId);
    if (!item) return;

    const updates = {
      quantidade_planejada: field === 'quantidade_planejada' ? value : item.quantidade_planejada,
      unidade: field === 'unidade' ? value : item.unidade,
    };

    try {
      await manageComponente(formData.id!, itemId, item.produto_id, updates.quantidade_planejada, updates.unidade, 'upsert');
      // Optimistic update
      setFormData(prev => ({
        ...prev,
        componentes: prev.componentes?.map(c => c.id === itemId ? { ...c, ...updates } : c)
      }));
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // --- Entregas ---
  const handleAddEntrega = async (data: Partial<OrdemEntrega>) => {
    if (!canEdit) {
      addToast('Você não tem permissão para editar esta ordem.', 'error');
      return;
    }
    if (!formData.id) return;
    const doc = data.documento_ref ?? data.documento_entrega;
    await manageEntrega(
      formData.id,
      null,
      data.data_entrega!,
      data.quantidade_entregue!,
      data.status_faturamento!,
      doc,
      data.observacoes,
      'upsert'
    );
    await loadDetails(formData.id);
    addToast('Entrega registrada.', 'success');
  };

  const handleRemoveEntrega = async (entregaId: string) => {
    if (!canEdit) {
      addToast('Você não tem permissão para editar esta ordem.', 'error');
      return;
    }
    try {
      await manageEntrega(formData.id!, entregaId, null, null, null, undefined, undefined, 'delete');
      await loadDetails(formData.id);
      addToast('Entrega removida.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status === 'concluida' || formData.status === 'cancelada';
  const isRoleReadOnly = !canEdit;
  const isLockedEffective = isLocked || isRoleReadOnly;
  const totalEntregue = formData.entregas?.reduce((acc, e) => acc + Number(e.quantidade_entregue), 0) || 0;
  const isWizard = !ordemId && !formData.id;
  const isExecucaoGerada = !!formData.execucao_ordem_id;
  const isHeaderLocked = isLockedEffective || isExecucaoGerada;
  const hasOrigemNfe = !!formData.origem_fiscal_nfe_item_id;
  const componentesCount = Array.isArray(formData.componentes) ? formData.componentes.length : 0;
	  const checklistExecucao = [
	    {
	      label: formData.tipo_ordem === 'beneficiamento' ? 'Cliente selecionado' : 'Cliente (opcional)',
	      status: formData.tipo_ordem === 'beneficiamento'
	        ? (formData.cliente_id ? 'ok' : 'error')
	        : (formData.cliente_id ? 'ok' : 'warn'),
	      details: formData.cliente_nome || (formData.tipo_ordem === 'beneficiamento' ? 'Selecione o cliente para prosseguir.' : 'Opcional para Industrialização.'),
	    },
	    ...(formData.tipo_ordem === 'beneficiamento'
	      ? ([
	          {
	            label: 'Material do cliente selecionado',
	            status: formData.material_cliente_id ? 'ok' : 'error',
	            details: formData.material_cliente_id
	              ? (formData.material_cliente_codigo || formData.material_cliente_nome || 'Selecionado')
	              : 'Selecione o material do cliente (ou importe o XML / cadastre o material).',
	          },
	        ] as const)
	      : []),
	    {
	      label: 'Produto e quantidade definidos',
	      status: formData.produto_final_id && (formData.quantidade_planejada || 0) > 0 ? 'ok' : 'error',
	      details: !formData.produto_final_id
	        ? 'Selecione o produto.'
        : (formData.quantidade_planejada || 0) <= 0
          ? 'A quantidade deve ser maior que zero.'
          : undefined,
    },
    {
      label: 'Roteiro',
      status: formData.roteiro_aplicado_id ? 'ok' : 'warn',
      details: formData.roteiro_aplicado_id
        ? (formData.roteiro_aplicado_desc || 'Selecionado')
        : 'Nenhum roteiro selecionado: será usado o roteiro padrão do produto (se existir).',
    },
    {
      label: 'Componentes/BOM',
      status: componentesCount > 0 ? 'ok' : 'warn',
      details: componentesCount > 0 ? `${componentesCount} item(ns) em componentes.` : 'Sem componentes definidos (pode ser ajustado depois).',
    },
  ] as const;
  const hasChecklistError = checklistExecucao.some(i => i.status === 'error');

	  const canGoNextWizardStep = () => {
	    if (wizardStep === 0) {
	      const hasProduto = !!formData.produto_final_id && !!formData.quantidade_planejada && formData.quantidade_planejada > 0;
	      const hasCliente = formData.tipo_ordem === 'beneficiamento' ? !!formData.cliente_id : true;
	      const hasMaterialCliente = formData.tipo_ordem === 'beneficiamento' ? !!formData.material_cliente_id : true;
	      return hasProduto && hasCliente && hasMaterialCliente;
	    }
	    return true;
	  };

  const handleGoToExecucao = (q?: string) => {
    const next = new URLSearchParams();
    next.set('view', 'list');
    if (q) next.set('q', q);
    navigate(`/app/industria/execucao?${next.toString()}`);
  };

  const handleDesvincularOrigemNfe = async () => {
    if (!canAdmin) {
      addToast('Você não tem permissão para desvincular a origem da NF-e.', 'error');
      return;
    }
    if (!hasOrigemNfe) return;
    if (isHeaderLocked) return;
    const ok = await confirm({
      title: 'Usar quantidade manual',
      description:
        'Esta ordem foi criada a partir de uma NF-e. Ao desvincular, você poderá alterar produto/unidade/quantidade manualmente e o rastreio do item da NF será removido desta ordem. Deseja continuar?',
      confirmText: 'Desvincular',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    handleHeaderChange('origem_fiscal_nfe_import_id', null);
    handleHeaderChange('origem_fiscal_nfe_item_id', null);
    handleHeaderChange('origem_qtd_xml', null);
    handleHeaderChange('origem_unidade_xml', null);
    addToast('Origem da NF-e desvinculada. Agora você pode editar manualmente.', 'success');
  };

  const handleGerarExecucao = async () => {
    if (!canEdit) {
      addToast('Você não tem permissão para gerar operações.', 'error');
      return;
    }
    if (isLockedEffective) return;
    setIsGeneratingExecucao(true);
    try {
      let currentId = formData.id;
      if (!currentId) {
        currentId = await handleSaveHeader();
        if (!currentId) return;
      }

      const result = await gerarExecucaoOrdem(currentId, formData.roteiro_aplicado_id ?? null);
      await loadDetails(currentId);
      addToast(`Operações geradas (${result.operacoes}).`, 'success');
      handleGoToExecucao(result.producao_ordem_numero ? String(result.producao_ordem_numero) : formData.produto_nome || undefined);
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível gerar operações.', 'error');
    } finally {
      setIsGeneratingExecucao(false);
    }
  };

  const handleCriarRevisao = async () => {
    if (!formData.id) return;
    const ok = await confirm({
      title: 'Criar revisão',
      description: 'Criar uma revisão desta ordem? Uma nova ordem em rascunho será criada para você ajustar e liberar novamente.',
      confirmText: 'Criar revisão',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    try {
      const cloned = await cloneOrdem(formData.id);
      addToast('Revisão criada.', 'success');
      onSaveSuccess();
      onOpenOrder?.(cloned.id);
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível criar a revisão.', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/20">
        <div className="flex items-center justify-between py-4 px-6 bg-gray-50 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {formData.numero
                ? `Ordem ${formatOrderNumber(formData.numero)}`
                : (formData.tipo_ordem === 'beneficiamento' ? 'Nova Ordem de Beneficiamento' : 'Nova Ordem de Industrialização')}
            </h2>
            <p className="text-sm text-gray-500">{formData.tipo_ordem === 'industrializacao' ? 'Industrialização' : 'Beneficiamento'}</p>
          </div>
          {formData.status && (
            <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase ${formData.status === 'concluida' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
              {formData.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <nav className="-mb-px flex space-x-6 p-4 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('dados')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'dados'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Dados Gerais
          </button>
          <button
            onClick={() => setActiveTab('componentes')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'componentes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            disabled={!formData.id}
          >
            Roteiro e Insumos (BOM)
          </button>
          <button
            onClick={() => setActiveTab('entregas')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'entregas'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            disabled={!formData.id}
          >
            Entregas ({formData.entregas?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'historico'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            disabled={!formData.id}
          >
            Histórico
          </button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'dados' && (
          <>
            {isWizard && (
              <div className="mb-6 p-4 rounded-xl border border-blue-100 bg-blue-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
                      Wizard de {formData.tipo_ordem === 'beneficiamento' ? 'Beneficiamento' : 'Industrialização'}
                    </div>
                    <div className="text-sm text-blue-900">
                      Passo {wizardStep + 1} de 3 • {wizardStep === 0 ? 'Produto e quantidade' : wizardStep === 1 ? 'Programação' : 'Revisão'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`h-2.5 w-12 rounded-full ${i <= wizardStep ? 'bg-blue-600' : 'bg-blue-200'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <Section title="Planejamento" description="O que será produzido e para quem.">
              <div className="sm:col-span-2">
                <Select
                  label="Tipo de Ordem"
                  name="tipo_ordem"
                  value={formData.tipo_ordem}
                  onChange={async (e) => {
                    const nextTipo = e.target.value as 'industrializacao' | 'beneficiamento';
                    if (nextTipo === formData.tipo_ordem) return;

                    if (!allowTipoOrdemChange || formData.id || ordemId) return;

                    const hasAnyData =
                      !!formData.cliente_id ||
                      !!formData.produto_final_id ||
                      !!formData.quantidade_planejada ||
                      !!formData.documento_ref ||
                      !!formData.material_cliente_id ||
                      !!formData.material_cliente_nome ||
                      !!formData.material_cliente_codigo;

                    if (hasAnyData) {
                      const ok = await confirm({
                        title: 'Trocar tipo de ordem',
                        description: 'Trocar o tipo de ordem irá reiniciar os campos preenchidos nesta ordem. Deseja continuar?',
                        confirmText: 'Trocar e reiniciar',
                        cancelText: 'Cancelar',
                        variant: 'danger',
                      });
                      if (!ok) return;
                    }

                    onTipoOrdemChange?.(nextTipo);
                  }}
                  disabled={!!formData.id || !!ordemId || !allowTipoOrdemChange}
                >
                  <option value="industrializacao">Industrialização</option>
                  <option value="beneficiamento">Beneficiamento</option>
                </Select>
              </div>
              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.tipo_ordem === 'beneficiamento' ? 'Produto/Serviço Interno' : 'Produto Final'}
                </label>
                {formData.id ? (
                  <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                    {formData.produto_nome}
                  </div>
                ) : formData.produto_final_id && formData.produto_nome ? (
                  <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="text-gray-800 font-medium truncate">{formData.produto_nome}</div>
                    {!isHeaderLocked && !hasOrigemNfe && (
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange('produto_final_id', null);
                          handleHeaderChange('produto_nome', null);
                          handleHeaderChange('usa_material_cliente', false);
                          handleHeaderChange('material_cliente_id', null);
                          handleHeaderChange('material_cliente_nome', null);
                          handleHeaderChange('material_cliente_codigo', null);
                          handleHeaderChange('material_cliente_unidade', null);
                        }}
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap"
                      >
                        Trocar
                      </button>
                    )}
                  </div>
                ) : (
                  <ItemAutocomplete onSelect={handleProductSelect} clearOnSelect={false} />
                )}
              </div>
              <div className="sm:col-span-2">
                <Input
                  label={
                    <div className="flex items-center justify-between gap-3">
                      <span>Quantidade Planejada</span>
                      {hasOrigemNfe && (
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            NF-e
                          </span>
                          {canAdmin && !isHeaderLocked && (
                            <button
                              type="button"
                              onClick={handleDesvincularOrigemNfe}
                              className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline whitespace-nowrap"
                              title="Desvincula a origem da NF-e para permitir edição manual."
                            >
                              Usar quantidade manual
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  }
                  name="qtd"
                  type="number"
                  value={formData.quantidade_planejada || ''}
                  onChange={e => handleHeaderChange('quantidade_planejada', parseFloat(e.target.value))}
                  disabled={isHeaderLocked || hasOrigemNfe}
                />
                {hasOrigemNfe && (
                  <div className="mt-1 text-xs text-gray-500">
                    Definida pelo XML: {formData.origem_qtd_xml ?? '—'} {formData.origem_unidade_xml || formData.unidade || ''}
                  </div>
                )}
              </div>
              <div className="sm:col-span-1">
                <Input
                  label="Unidade"
                  name="unidade"
                  value={formData.unidade || ''}
                  onChange={e => handleHeaderChange('unidade', e.target.value)}
                  disabled={isHeaderLocked || hasOrigemNfe}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente{formData.tipo_ordem === 'beneficiamento' ? ' *' : ' (Opcional)'}
                </label>
                <ClientAutocomplete
                  value={formData.cliente_id || null}
                  initialName={formData.cliente_nome}
                  onChange={(id, name) => {
                    handleHeaderChange('cliente_id', id);
                    if (name) handleHeaderChange('cliente_nome', name);
                    handleHeaderChange('usa_material_cliente', false);
                    handleHeaderChange('material_cliente_id', null);
                    handleHeaderChange('material_cliente_nome', null);
                    handleHeaderChange('material_cliente_codigo', null);
                    handleHeaderChange('material_cliente_unidade', null);
                  }}
                  disabled={isHeaderLocked}
                />
              </div>

              {formData.tipo_ordem === 'beneficiamento' && (
                <div className="sm:col-span-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">Material do Cliente</label>
                    <div className="flex items-center gap-2">
                      <a
                        href="/app/industria/materiais-cliente"
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        Cadastrar material
                      </a>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setShowImportXmlModal(true)}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        Importar XML (NF-e)
                      </button>
                    </div>
                  </div>
                  <MaterialClienteAutocomplete
                    key={materialRefreshToken}
                    clienteId={formData.cliente_id || null}
                    value={materialClienteValue?.id || null}
                    initialName={
                      formData.material_cliente_nome ||
                      formData.material_cliente_codigo ||
                      materialClienteValue?.nome_cliente ||
                      materialClienteValue?.produto_nome
                    }
                    disabled={isLockedEffective || !formData.cliente_id}
                    onChange={(m) => {
                      if (!m) {
                        handleHeaderChange('usa_material_cliente', false);
                        handleHeaderChange('material_cliente_id', null);
                        handleHeaderChange('material_cliente_nome', null);
                        handleHeaderChange('material_cliente_codigo', null);
                        handleHeaderChange('material_cliente_unidade', null);
                        return;
                      }
                      handleHeaderChange('usa_material_cliente', true);
                      handleHeaderChange('material_cliente_id', m.id);
                      handleHeaderChange('material_cliente_nome', m.nome_cliente);
                      handleHeaderChange('material_cliente_codigo', m.codigo_cliente);
                      handleHeaderChange('material_cliente_unidade', m.unidade);
                      handleHeaderChange('produto_final_id', m.produto_id);
                      handleHeaderChange('produto_nome', m.produto_nome);
                      if (m.unidade) handleHeaderChange('unidade', m.unidade);
                    }}
                  />
                  <p className="text-xs text-gray-500">
                    Dica: selecione o material do cliente para preencher automaticamente o produto interno.
                  </p>
                </div>
              )}
            </Section>

            {(!isWizard || wizardStep >= 1) && (
            <Section title="Programação" description="Prazos e status.">
              <div className="sm:col-span-2">
                <Select label="Status" name="status" value={formData.status} onChange={e => handleHeaderChange('status', e.target.value)} disabled={isLockedEffective}>
                  <option value="rascunho">Rascunho</option>
                  <option value="planejada">Planejada</option>
                  <option value="em_programacao">Em Programação</option>
                  <option value="em_producao">Em Produção</option>
                  <option value="em_inspecao">Em Inspeção</option>
                  <option value="parcialmente_concluida">Parcialmente Concluída</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Prioridade (0-100)"
                  name="prioridade"
                  type="number"
                  value={formData.prioridade || 0}
                  onChange={e => handleHeaderChange('prioridade', parseInt(e.target.value))}
                  disabled={isLockedEffective}
                />
              </div>
              <div className="sm:col-span-2"></div>

              <Input label="Início Previsto" type="date" value={formData.data_prevista_inicio || ''} onChange={e => handleHeaderChange('data_prevista_inicio', e.target.value)} disabled={isLockedEffective} className="sm:col-span-2" />
              <Input label="Fim Previsto" type="date" value={formData.data_prevista_fim || ''} onChange={e => handleHeaderChange('data_prevista_fim', e.target.value)} disabled={isLockedEffective} className="sm:col-span-2" />
              <Input label="Entrega Prevista" type="date" value={formData.data_prevista_entrega || ''} onChange={e => handleHeaderChange('data_prevista_entrega', e.target.value)} disabled={isLockedEffective} className="sm:col-span-2" />
            </Section>
            )}

            {(!isWizard || wizardStep === 2) && (
            <Section title="Outros" description="Detalhes adicionais.">
              {formData.tipo_ordem === 'beneficiamento' && (
                <>
                  <Input
                    label="Qtde. de Caixas"
                    name="qtde_caixas"
                    type="number"
                    value={formData.qtde_caixas ?? ''}
                    onChange={e => handleHeaderChange('qtde_caixas', e.target.value === '' ? null : Number(e.target.value))}
                    disabled={isLockedEffective}
                    className="sm:col-span-2"
                    placeholder="Ex: 10"
                  />
                  <Input
                    label="Número da NF (cliente)"
                    name="numero_nf"
                    value={formData.numero_nf || ''}
                    onChange={e => handleHeaderChange('numero_nf', e.target.value)}
                    disabled={isLockedEffective}
                    className="sm:col-span-2"
                    placeholder="Ex: 12345"
                  />
                  <Input
                    label="Número do Pedido"
                    name="pedido_numero"
                    value={formData.pedido_numero || ''}
                    onChange={e => handleHeaderChange('pedido_numero', e.target.value)}
                    disabled={isLockedEffective}
                    className="sm:col-span-2"
                    placeholder="Pedido do cliente"
                  />
                </>
              )}
              <Input label="Ref. Documento" name="doc_ref" value={formData.documento_ref || ''} onChange={e => handleHeaderChange('documento_ref', e.target.value)} disabled={isLockedEffective} className="sm:col-span-2" placeholder="Pedido, Lote..." />
              <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLockedEffective} className="sm:col-span-6" />
            </Section>
            )}
          </>
        )}

        {activeTab === 'componentes' && (
          <>
            {!isLockedEffective && formData.produto_final_id && (
              <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800">
                    {formData.roteiro_aplicado_desc
                      ? <>Roteiro: <strong>{formData.roteiro_aplicado_desc}</strong></>
                      : 'Nenhum roteiro aplicado.'}
                  </p>
                  <RoteiroSelector
                    ordemId={formData.id || 'new'}
                    produtoId={formData.produto_final_id}
                    tipoBom={formData.tipo_ordem === 'beneficiamento' ? 'beneficiamento' : 'producao'}
                    disabled={isExecucaoGerada || isLockedEffective}
                    onApplied={(roteiro) => {
                      handleHeaderChange('roteiro_aplicado_id', roteiro.id);
                      const label = `${roteiro.codigo || 'Sem código'} (v${roteiro.versao})${roteiro.descricao ? ` - ${roteiro.descricao}` : ''}`;
                      handleHeaderChange('roteiro_aplicado_desc', label);
                    }}
                  />
                </div>

                <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800">
                    {formData.bom_aplicado_desc
                      ? <>BOM: <strong>{formData.bom_aplicado_desc}</strong></>
                      : 'Nenhuma BOM aplicada.'}
                  </p>
                    <BomSelector
                    ordemId={formData.id || ''}
                    produtoId={formData.produto_final_id}
                    tipoOrdem={formData.tipo_ordem === 'beneficiamento' ? 'beneficiamento' : 'producao'}
                    openOnMount={false}
                    disabled={isExecucaoGerada || isLockedEffective}
                    onEnsureOrder={ensureOrderSaved}
                    onApplied={(bom, appliedOrdemId) => {
                      handleHeaderChange('bom_aplicado_id', bom.id);
                      handleHeaderChange('bom_aplicado_desc', bom.codigo ? `${bom.codigo} (v${bom.versao})` : bom.descricao || 'Ficha técnica aplicada');
                      loadDetails(appliedOrdemId);
                    }}
                  />
                </div>
              </div>
            )}
            <OrdemFormItems
              items={formData.componentes || []}
              onAddItem={handleAddComponente}
              onRemoveItem={handleRemoveComponente}
              onUpdateItem={handleUpdateComponente}
              isAddingItem={false}
              readOnly={isLockedEffective}
              highlightItemId={highlightComponenteId}
            />
          </>
        )}

        {activeTab === 'entregas' && (
          <OrdemEntregas
            entregas={formData.entregas || []}
            onAddEntrega={handleAddEntrega}
            onRemoveEntrega={handleRemoveEntrega}
            readOnly={isLockedEffective}
            maxQuantity={formData.quantidade_planejada || 0}
            currentTotal={totalEntregue}
            showBillingStatus={formData.tipo_ordem === 'beneficiamento'}
            highlightEntregaId={highlightEntregaId}
          />
        )}

        {activeTab === 'historico' && (
          formData.id ? (
            <IndustriaAuditTrailPanel
              ordemId={formData.id}
              tables={[
                'industria_ordens',
                'industria_ordens_componentes',
                'industria_ordens_entregas',
              ]}
              onNavigate={(row) => {
                if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
                setHighlightComponenteId(null);
                setHighlightEntregaId(null);

                const targetId =
                  row.record_id ||
                  (typeof row.new_data?.id === 'string' ? (row.new_data.id as string) : null) ||
                  (typeof row.old_data?.id === 'string' ? (row.old_data.id as string) : null);

                const tableName = row.table_name || '';

                if (tableName === 'industria_ordens') setActiveTab('dados');
                else if (tableName === 'industria_ordens_componentes' || tableName.includes('componentes')) {
                  setActiveTab('componentes');
                  if (targetId) setHighlightComponenteId(targetId);
                }
                else if (tableName === 'industria_ordens_entregas' || tableName.includes('entregas')) {
                  setActiveTab('entregas');
                  if (targetId) setHighlightEntregaId(targetId);
                }
                else setActiveTab('dados');

                highlightTimerRef.current = window.setTimeout(() => {
                  setHighlightComponenteId(null);
                  setHighlightEntregaId(null);
                }, 4500);
              }}
            />
          ) : (
            <div className="text-sm text-gray-500">Salve a ordem para visualizar o histórico.</div>
          )
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-between items-center border-t border-white/20">
        <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          Fechar
        </button>
        <div className="flex gap-3">
          {formData.id && isHeaderLocked && canEdit && (
            <button
              type="button"
              onClick={handleCriarRevisao}
              className="flex items-center gap-2 border border-amber-200 bg-amber-50 text-amber-900 font-bold py-2 px-4 rounded-lg hover:bg-amber-100"
              title="Cria uma nova ordem em rascunho para ajustar após a execução já ter sido gerada."
            >
              <Save size={18} />
              Criar revisão
            </button>
          )}
          {!isLockedEffective && formData.id && !formData.execucao_ordem_id && (
            <button
              type="button"
              onClick={() => setShowGerarExecucaoModal(true)}
              disabled={isGeneratingExecucao}
              className="flex items-center gap-2 border border-blue-200 bg-blue-50 text-blue-800 font-bold py-2 px-4 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              title="Gera operações e abre Execução"
            >
              {isGeneratingExecucao ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={18} />}
              Gerar operações
            </button>
          )}
          {formData.execucao_ordem_id && (
            <button
              type="button"
              onClick={() => handleGoToExecucao(formData.execucao_ordem_numero ? String(formData.execucao_ordem_numero) : undefined)}
              className="flex items-center gap-2 border border-gray-200 bg-white text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-50"
              title="Abrir Execução"
            >
              <ArrowRight size={18} />
              Abrir Execução
            </button>
          )}
          {!isLockedEffective && canEdit && !isWizard && (
            <button
              onClick={handleSaveHeader}
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
          )}
          {!isLockedEffective && canEdit && isWizard && (
            <>
              {wizardStep > 0 && (
                <button
                  type="button"
                  onClick={() => setWizardStep(s => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}
                  className="flex items-center gap-2 border border-gray-300 bg-white text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-50"
                >
                  <ArrowLeft size={18} /> Voltar
                </button>
              )}
              {wizardStep < 2 ? (
                <button
                  type="button"
                  disabled={!canGoNextWizardStep()}
                  onClick={() => setWizardStep(s => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s))}
                  className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Próximo <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  onClick={handleSaveHeader}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  Salvar e continuar
                </button>
              )}
            </>
          )}
        </div>
      </footer>

      <Modal
        isOpen={showGerarExecucaoModal}
        onClose={() => setShowGerarExecucaoModal(false)}
        title="Gerar Execução (Checklist)"
        size="lg"
      >
        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-800">Resumo</div>
            <div className="mt-2 text-sm text-gray-700">
              <div><span className="font-medium">Ordem:</span> {formData.numero ? formatOrderNumber(formData.numero) : 'Nova (será salva)'} • {formData.tipo_ordem === 'beneficiamento' ? 'Beneficiamento' : 'Industrialização'}</div>
              <div><span className="font-medium">Cliente:</span> {formData.cliente_nome || '—'}</div>
              <div><span className="font-medium">Produto:</span> {formData.produto_nome || '—'}</div>
              <div><span className="font-medium">Quantidade:</span> {formData.quantidade_planejada || 0} {formData.unidade || ''}</div>
              <div><span className="font-medium">Roteiro:</span> {formData.roteiro_aplicado_desc || 'Padrão do produto (se existir)'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            Ao gerar a Execução, o sistema criará a ordem de produção correspondente, gerará as operações e travará o cabeçalho/roteiro desta ordem.
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-800">Checklist</div>
            <div className="mt-3 space-y-2">
              {checklistExecucao.map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  {item.status === 'ok' ? (
                    <CheckCircle2 className="text-green-600 mt-0.5" size={18} />
                  ) : item.status === 'warn' ? (
                    <TriangleAlert className="text-amber-600 mt-0.5" size={18} />
                  ) : (
                    <XCircle className="text-rose-600 mt-0.5" size={18} />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{item.label}</div>
                    {item.details && <div className="text-xs text-gray-600">{item.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowGerarExecucaoModal(false)}
              className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={isGeneratingExecucao || hasChecklistError || isLockedEffective || !canEdit}
              onClick={async () => {
                setShowGerarExecucaoModal(false);
                await handleGerarExecucao();
              }}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isGeneratingExecucao ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={18} />}
              Gerar e abrir Execução
            </button>
          </div>
        </div>
      </Modal>
      <ImportarXmlSuprimentosModal
        isOpen={showImportXmlModal}
        onClose={() => setShowImportXmlModal(false)}
        onFinished={({ recebimentoId }) => {
          setShowImportXmlModal(false);
          setMaterialRefreshToken(Date.now());

          void (async () => {
            if (formData.tipo_ordem !== 'beneficiamento') return;
            if (!formData.cliente_id) {
              addToast('Selecione o cliente antes de importar o XML.', 'warning');
              return;
            }

            try {
              const { data } = await listMateriaisCliente(undefined, formData.cliente_id, true, 1, 20);
              if (!data || data.length === 0) {
                addToast('Importação concluída, mas nenhum Material do Cliente foi encontrado para este cliente.', 'warning');
                return;
              }

              const alreadySelected = !!formData.material_cliente_id;
              const byProduto = formData.produto_final_id ? data.find(m => m.produto_id === formData.produto_final_id) : null;
              const shouldAutoSelect = !alreadySelected && (data.length === 1 || !!byProduto);
              if (!shouldAutoSelect) {
                addToast('Importação concluída. Atualizamos a lista de Materiais do Cliente.', 'success');
                return;
              }

              const m = byProduto ?? data[0];
              handleHeaderChange('usa_material_cliente', true);
              handleHeaderChange('material_cliente_id', m.id);
              handleHeaderChange('material_cliente_nome', m.nome_cliente);
              handleHeaderChange('material_cliente_codigo', m.codigo_cliente);
              handleHeaderChange('material_cliente_unidade', m.unidade);
              handleHeaderChange('produto_final_id', m.produto_id);
              handleHeaderChange('produto_nome', m.produto_nome);
              if (m.unidade) handleHeaderChange('unidade', m.unidade);

              addToast(`Material do cliente atualizado via XML (rec.: ${recebimentoId}).`, 'success');
            } catch (e) {
              logger.error('[Indústria][OB] Falha ao atualizar materiais após importação de XML', e, { recebimentoId });
              addToast('Importação concluída, mas não foi possível atualizar automaticamente o Material do Cliente.', 'warning');
            }
          })();
        }}
      />
    </div>
  );
}
