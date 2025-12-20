import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Save, TriangleAlert, XCircle } from 'lucide-react';
import { OrdemIndustriaDetails, OrdemPayload, saveOrdem, getOrdemDetails, manageComponente, manageEntrega, OrdemEntrega, gerarExecucaoOrdem, cloneOrdem } from '@/services/industria';
import { useToast } from '@/contexts/ToastProvider';
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
import { ensureMaterialClienteV2 } from '@/services/industriaMateriais';
import type { MaterialClienteListItem } from '@/services/industriaMateriais';
import { useNavigate } from 'react-router-dom';
import Modal from '@/components/ui/Modal';

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!ordemId);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingExecucao, setIsGeneratingExecucao] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes' | 'entregas'>('dados');
  const [materialCliente, setMaterialCliente] = useState<MaterialClienteListItem | null>(null);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [autoOpenBomSelector, setAutoOpenBomSelector] = useState(false);
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
    if (ordemId) return;
    if (formData.tipo_ordem !== 'beneficiamento') return;

    const hasCliente = !!formData.cliente_id;
    const hasProduto = !!formData.produto_final_id;
    const hasQtd = !!formData.quantidade_planejada && formData.quantidade_planejada > 0;

    if (!hasCliente) setWizardStep(0);
    else if (!hasProduto || !hasQtd) setWizardStep(1);
    else setWizardStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordemId, formData.tipo_ordem]);

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
      setMaterialCliente(null);
    } catch (e) {
      console.error(e);
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
    setMaterialCliente(null);
  };

  const handleSaveHeader = async () => {
    if (formData.tipo_ordem === 'beneficiamento' && !formData.cliente_id) {
      addToast('Para beneficiamento, selecione o cliente.', 'error');
      return;
    }
    if (!formData.produto_final_id) {
      addToast('Selecione um produto final.', 'error');
      return;
    }
    if (!formData.quantidade_planejada || formData.quantidade_planejada <= 0) {
      addToast('A quantidade planejada deve ser maior que zero.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let materialClienteId = formData.material_cliente_id || null;
      let usaMaterialCliente = !!formData.usa_material_cliente;

      if (formData.tipo_ordem === 'beneficiamento' && formData.cliente_id && formData.produto_final_id && !materialClienteId) {
        const shouldCreate = window.confirm(
          'Nenhum "Material do Cliente" foi selecionado.\n\nDeseja criar automaticamente um vínculo usando o produto interno selecionado?'
        );

        if (shouldCreate) {
          materialClienteId = await ensureMaterialClienteV2(
            formData.cliente_id,
            formData.produto_final_id,
            formData.produto_nome || 'Material',
            formData.material_cliente_unidade || formData.unidade || 'un',
            {
              codigoCliente: formData.material_cliente_codigo ?? null,
              nomeCliente: formData.material_cliente_nome ?? null,
            }
          );
          usaMaterialCliente = true;

          setFormData(prev => ({
            ...prev,
            usa_material_cliente: true,
            material_cliente_id: materialClienteId,
            material_cliente_nome: prev.material_cliente_nome ?? prev.produto_nome ?? null,
            material_cliente_unidade: prev.material_cliente_unidade ?? prev.unidade ?? null,
          }));
        } else {
          usaMaterialCliente = false;
        }
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
      };

      const saved = await saveOrdem(payload);
      setFormData(prev => ({ ...prev, ...saved }));

      if (!formData.id) {
        addToast('Ordem criada! Configure os componentes.', 'success');
        setActiveTab('componentes');
        if (formData.tipo_ordem === 'beneficiamento') setAutoOpenBomSelector(true);
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

  // --- Componentes ---
  const handleAddComponente = async (item: any) => {
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
    try {
      await manageComponente(formData.id!, itemId, '', 0, '', 'delete');
      await loadDetails(formData.id);
      addToast('Componente removido.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleUpdateComponente = async (itemId: string, field: string, value: any) => {
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
    try {
      await manageEntrega(formData.id!, entregaId, '', 0, 'nao_faturado', undefined, undefined, 'delete');
      await loadDetails(formData.id);
      addToast('Entrega removida.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status === 'concluida' || formData.status === 'cancelada';
  const totalEntregue = formData.entregas?.reduce((acc, e) => acc + Number(e.quantidade_entregue), 0) || 0;
  const isWizard = !ordemId && !formData.id && formData.tipo_ordem === 'beneficiamento';
  const isExecucaoGerada = !!formData.execucao_ordem_id;
  const isHeaderLocked = isLocked || isExecucaoGerada;
  const componentesCount = Array.isArray(formData.componentes) ? formData.componentes.length : 0;
  const checklistExecucao = [
    {
      label: formData.tipo_ordem === 'beneficiamento' ? 'Cliente selecionado' : 'Cliente (opcional)',
      status: formData.tipo_ordem === 'beneficiamento'
        ? (formData.cliente_id ? 'ok' : 'error')
        : (formData.cliente_id ? 'ok' : 'warn'),
      details: formData.cliente_nome || (formData.tipo_ordem === 'beneficiamento' ? 'Selecione o cliente para prosseguir.' : 'Opcional para Industrialização.'),
    },
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
    if (wizardStep === 0) return !!formData.cliente_id;
    if (wizardStep === 1) return !!formData.produto_final_id && !!formData.quantidade_planejada && formData.quantidade_planejada > 0;
    return true;
  };

  useEffect(() => {
    if (formData.tipo_ordem !== 'beneficiamento') {
      setMaterialCliente(null);
      return;
    }
    if (!formData.material_cliente_id) {
      setMaterialCliente(null);
      return;
    }
    if (!formData.cliente_id) {
      setMaterialCliente(null);
      return;
    }

    setMaterialCliente({
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
    });
  }, [formData.tipo_ordem, formData.material_cliente_id, formData.cliente_id]);

  const handleGoToExecucao = (q?: string) => {
    const next = new URLSearchParams();
    next.set('view', 'list');
    if (q) next.set('q', q);
    navigate(`/app/industria/execucao?${next.toString()}`);
  };

  const handleGerarExecucao = async () => {
    if (isLocked) return;
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
    if (!window.confirm('Criar uma revisão desta ordem? Uma nova ordem em rascunho será criada para você ajustar e liberar novamente.')) return;
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
            Insumos / Componentes
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
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'dados' && (
          <>
            {isWizard && (
              <div className="mb-6 p-4 rounded-xl border border-blue-100 bg-blue-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Wizard de Beneficiamento</div>
                    <div className="text-sm text-blue-900">
                      Passo {wizardStep + 1} de 3 • {wizardStep === 0 ? 'Cliente' : wizardStep === 1 ? 'Material e quantidade' : 'Revisão'}
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
                  onChange={e => {
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
                      const ok = window.confirm(
                        'Trocar o tipo de ordem irá reiniciar os campos preenchidos nesta ordem.\n\nDeseja continuar?'
                      );
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
                    {!isHeaderLocked && (
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
                          setMaterialCliente(null);
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
                  label="Quantidade Planejada"
                  name="qtd"
                  type="number"
                  value={formData.quantidade_planejada || ''}
                  onChange={e => handleHeaderChange('quantidade_planejada', parseFloat(e.target.value))}
                  disabled={isHeaderLocked}
                />
              </div>
              <div className="sm:col-span-1">
                <Input
                  label="Unidade"
                  name="unidade"
                  value={formData.unidade || ''}
                  onChange={e => handleHeaderChange('unidade', e.target.value)}
                  disabled={isHeaderLocked}
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
                    setMaterialCliente(null);
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
                    <label className="block text-sm font-medium text-gray-700">Material do Cliente (opcional)</label>
                    <div className="flex items-center gap-2">
                      <a
                        href="/app/industria/materiais-cliente"
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        Cadastrar material
                      </a>
                      <span className="text-gray-300">|</span>
                      <a
                        href="/app/nfe-input"
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        Importar XML (NF-e)
                      </a>
                    </div>
                  </div>
                  <MaterialClienteAutocomplete
                    clienteId={formData.cliente_id || null}
                    value={formData.material_cliente_id || materialCliente?.id || null}
                    initialName={
                      formData.material_cliente_nome ||
                      formData.material_cliente_codigo ||
                      materialCliente?.nome_cliente ||
                      materialCliente?.produto_nome
                    }
                    disabled={isLocked || !formData.cliente_id}
                    onChange={(m) => {
                      setMaterialCliente(m);
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

            {(!isWizard || wizardStep === 2) && (
              <Section
                title="Processo"
                description="Selecione o roteiro para gerar as operações de Execução (Chão/Tela do Operador)."
              >
                <div className="sm:col-span-6 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="min-w-[220px]">
                      <div className="text-xs font-semibold text-gray-500">Roteiro aplicado</div>
                      <div className="text-sm font-medium text-gray-800">
                        {formData.roteiro_aplicado_desc
                          ? formData.roteiro_aplicado_desc
                          : 'Nenhum selecionado (usará o padrão do produto, se existir)'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RoteiroSelector
                        ordemId={formData.id || 'new'}
                        produtoId={formData.produto_final_id || ''}
                        tipoBom={formData.tipo_ordem === 'beneficiamento' ? 'beneficiamento' : 'producao'}
                        disabled={isLocked || isExecucaoGerada}
                        onApplied={(roteiro) => {
                          handleHeaderChange('roteiro_aplicado_id', roteiro.id);
                          const label = `${roteiro.codigo || 'Sem código'} (v${roteiro.versao})${roteiro.descricao ? ` - ${roteiro.descricao}` : ''}`;
                          handleHeaderChange('roteiro_aplicado_desc', label);
                        }}
                      />
                      {formData.execucao_ordem_id && (
                        <button
                          type="button"
                          onClick={() => handleGoToExecucao(formData.execucao_ordem_numero ? String(formData.execucao_ordem_numero) : undefined)}
                          className="text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors border border-gray-200"
                        >
                          Ir para Execução
                        </button>
                      )}
                    </div>
                  </div>
                  {!!formData.execucao_ordem_id && (
                    <div className="text-xs text-gray-500">
                      Execução gerada{formData.execucao_ordem_numero ? ` (OP ${formatOrderNumber(formData.execucao_ordem_numero)})` : ''}.
                    </div>
                  )}
                </div>
              </Section>
            )}

            {(!isWizard || wizardStep === 2) && (
            <Section title="Programação" description="Prazos e status.">
              <div className="sm:col-span-2">
                <Select label="Status" name="status" value={formData.status} onChange={e => handleHeaderChange('status', e.target.value)} disabled={isLocked}>
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
                  disabled={isLocked}
                />
              </div>
              <div className="sm:col-span-2"></div>

              <Input label="Início Previsto" type="date" value={formData.data_prevista_inicio || ''} onChange={e => handleHeaderChange('data_prevista_inicio', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
              <Input label="Fim Previsto" type="date" value={formData.data_prevista_fim || ''} onChange={e => handleHeaderChange('data_prevista_fim', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
              <Input label="Entrega Prevista" type="date" value={formData.data_prevista_entrega || ''} onChange={e => handleHeaderChange('data_prevista_entrega', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
            </Section>
            )}

            {(!isWizard || wizardStep === 2) && (
            <Section title="Outros" description="Detalhes adicionais.">
              <Input label="Ref. Documento" name="doc_ref" value={formData.documento_ref || ''} onChange={e => handleHeaderChange('documento_ref', e.target.value)} disabled={isLocked} className="sm:col-span-2" placeholder="Pedido, Lote..." />
              <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLocked} className="sm:col-span-6" />
            </Section>
            )}
          </>
        )}

        {activeTab === 'componentes' && (
          <>
            {!isLocked && formData.id && formData.produto_final_id && (
              <div className="mb-4 flex justify-end">
                <BomSelector
                  ordemId={formData.id}
                  produtoId={formData.produto_final_id}
                  tipoOrdem={formData.tipo_ordem === 'beneficiamento' ? 'beneficiamento' : 'producao'}
                  openOnMount={autoOpenBomSelector}
                  disabled={isExecucaoGerada}
                  onApplied={() => {
                    setAutoOpenBomSelector(false);
                    loadDetails(formData.id);
                  }}
                />
              </div>
            )}
            <OrdemFormItems
              items={formData.componentes || []}
              onAddItem={handleAddComponente}
              onRemoveItem={handleRemoveComponente}
              onUpdateItem={handleUpdateComponente}
              isAddingItem={false}
              readOnly={isLocked}
            />
          </>
        )}

        {activeTab === 'entregas' && (
          <OrdemEntregas
            entregas={formData.entregas || []}
            onAddEntrega={handleAddEntrega}
            onRemoveEntrega={handleRemoveEntrega}
            readOnly={isLocked}
            maxQuantity={formData.quantidade_planejada || 0}
            currentTotal={totalEntregue}
            showBillingStatus={formData.tipo_ordem === 'beneficiamento'}
          />
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-between items-center border-t border-white/20">
        <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          Fechar
        </button>
        <div className="flex gap-3">
          {formData.id && isHeaderLocked && (
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
          {!isLocked && formData.id && !formData.execucao_ordem_id && (
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
          {!isLocked && formData.execucao_ordem_id && (
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
          {!isLocked && !isWizard && (
            <button
              onClick={handleSaveHeader}
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
          )}
          {!isLocked && isWizard && (
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
              disabled={isGeneratingExecucao || hasChecklistError || isLocked}
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
    </div>
  );
}
