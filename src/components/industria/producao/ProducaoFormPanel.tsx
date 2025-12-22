import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Play, Save, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react';
import {
  OrdemProducaoDetails,
  OrdemProducaoPayload,
  saveOrdemProducao,
  getOrdemProducaoDetails,
  manageComponenteProducao,
  manageEntregaProducao,
  gerarOperacoes,
  registrarEntrega,
  deleteOrdemProducao,
  cloneOrdemProducao,
  fecharOrdemProducao,
  resetOrdemProducao
} from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import OrdemFormItems from '../ordens/OrdemFormItems';
import OrdemEntregas from '../ordens/OrdemEntregas';
import BomSelector from '../ordens/BomSelector';
import RoteiroSelector from '../ordens/RoteiroSelector';
import OperacoesGrid from './OperacoesGrid';
import { formatOrderNumber } from '@/lib/utils';
import { listUnidades, UnidadeMedida } from '@/services/unidades';
import Modal from '@/components/ui/Modal';
import { logger } from '@/lib/logger';
import IndustriaAuditTrailPanel from '@/components/industria/audit/IndustriaAuditTrailPanel';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';

interface Props {
  ordemId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
  allowTipoOrdemChange?: boolean;
  onTipoOrdemChange?: (tipo: 'industrializacao' | 'beneficiamento') => void;
  onOpenOrder?: (ordemId: string) => void;
}

export default function ProducaoFormPanel({
  ordemId,
  onSaveSuccess,
  onClose,
  allowTipoOrdemChange,
  onTipoOrdemChange,
  onOpenOrder,
}: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const empresaRoleQuery = useEmpresaRole();
  const empresaRole = empresaRoleQuery.data;
  // Enquanto o role não carregou, não travar o formulário (evita "race condition" de empresa/role).
  const canEdit = empresaRoleQuery.isFetched ? roleAtLeast(empresaRole, 'member') : true;
  const canAdmin = empresaRoleQuery.isFetched ? roleAtLeast(empresaRole, 'admin') : false;
  const canOperate = canEdit;
  const canConfigureQa = canAdmin;
  const [loading, setLoading] = useState(!!ordemId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes' | 'entregas' | 'operacoes' | 'historico'>('dados');
  const [highlightComponenteId, setHighlightComponenteId] = useState<string | null>(null);
  const [highlightEntregaId, setHighlightEntregaId] = useState<string | null>(null);
  const [highlightOperacaoId, setHighlightOperacaoId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [entregaBloqueada, setEntregaBloqueada] = useState<{ blocked: boolean; reason?: string } | null>(null);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [showLiberarModal, setShowLiberarModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [formData, setFormData] = useState<Partial<OrdemProducaoDetails>>({
    status: 'rascunho',
    origem_ordem: 'manual',
    prioridade: 0,
    unidade: 'un',
    quantidade_planejada: 0,
    componentes: [],
    entregas: [],
    reserva_modo: 'ao_liberar',
    tolerancia_overrun_percent: 0,
    lote_producao: ''
  });

  useEffect(() => {
    listUnidades()
      .then(setUnidades)
      .catch((e: any) => {
        logger.error('[Indústria][OP] Falha ao carregar unidades', e);
        addToast(e?.message || 'Erro ao carregar unidades.', 'error');
      });
  }, []);

  useEffect(() => {
    if (ordemId) {
      loadDetails();
    }
  }, [ordemId]);

  const loadDetails = async (idOverride?: string) => {
    const idToLoad = idOverride || ordemId || formData.id;
    if (!idToLoad) return;

    try {
      const data = await getOrdemProducaoDetails(idToLoad);
      if (!data) {
        addToast('Ordem não encontrada (talvez tenha sido excluída).', 'error');
        if (ordemId) onClose();
        return;
      }
      setFormData(data);
      const bloqueio = checkEntregaBlocked(data);
      setEntregaBloqueada(bloqueio);
    } catch (e) {
      logger.error('[Indústria][OP] Falha ao carregar ordem', e, { ordemId: idToLoad });
      addToast('Erro ao carregar ordem.', 'error');
      if (ordemId) onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof OrdemProducaoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelect = (item: any) => {
    handleHeaderChange('produto_final_id', item.id);
    handleHeaderChange('produto_nome' as any, item.descricao);
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
      const payload: OrdemProducaoPayload = {
        id: formData.id,
        origem_ordem: formData.origem_ordem,
        produto_final_id: formData.produto_final_id,
        quantidade_planejada: formData.quantidade_planejada,
        unidade: formData.unidade,
        status: formData.status,
        prioridade: formData.prioridade || 0,
        data_prevista_inicio: formData.data_prevista_inicio,
        data_prevista_fim: formData.data_prevista_fim,
        data_prevista_entrega: formData.data_prevista_entrega,
        documento_ref: formData.documento_ref,
        observacoes: formData.observacoes,
        roteiro_aplicado_id: formData.roteiro_aplicado_id,
        roteiro_aplicado_desc: formData.roteiro_aplicado_desc,
        bom_aplicado_id: formData.bom_aplicado_id,
        bom_aplicado_desc: formData.bom_aplicado_desc,
        lote_producao: formData.lote_producao,
        reserva_modo: formData.reserva_modo,
        tolerancia_overrun_percent: formData.tolerancia_overrun_percent
      };

      const saved = await saveOrdemProducao(payload);
      setFormData(prev => ({ ...prev, ...saved }));

      if (!formData.id) {
        addToast('Ordem criada! Configure os componentes.', 'success');
        setActiveTab('componentes');
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

  const handleAddComponente = async (item: any) => {
    let currentId = formData.id;
    if (!currentId) {
      const savedId = await handleSaveHeader();
      if (!savedId) return;
      currentId = savedId;
    }

    // Double check currentId is set before proceeding
    if (!currentId) {
      addToast('Erro: ID da ordem não disponível.', 'error');
      return;
    }

    try {
      await manageComponenteProducao(currentId, null, item.id, 1, 'un', 'upsert');
      await loadDetails(currentId);
      addToast('Componente adicionado.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveComponente = async (itemId: string) => {
    try {
      await manageComponenteProducao(formData.id!, itemId, '', 0, '', 'delete');
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
      await manageComponenteProducao(formData.id!, itemId, item.produto_id, updates.quantidade_planejada, updates.unidade, 'upsert');
      setFormData(prev => ({
        ...prev,
        componentes: prev.componentes?.map(c => c.id === itemId ? { ...c, ...updates } : c)
      }));
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleAddEntrega = async (data: any) => {
    if (!formData.id) return;
    try {
      await registrarEntrega({
        ordem_id: formData.id,
        quantidade: data.quantidade_entregue!,
        data_entrega: data.data_entrega!,
        lote: formData.lote_producao,
        documento_ref: data.documento_ref,
        observacoes: data.observacoes
      });
      await loadDetails(formData.id);
      addToast('Entrega registrada com sucesso!', 'success');
    } catch (e: any) {
      addToast('Erro ao registrar entrega: ' + e.message, 'error');
    }
  };

  const handleRemoveEntrega = async (entregaId: string) => {
    try {
      await manageEntregaProducao(formData.id!, entregaId, '', 0, undefined, undefined, 'delete');
      await loadDetails(formData.id);
      addToast('Entrega removida.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleBomApplied = async (bom: any) => {
    if (!formData.id) return;
    try {
      const codigo = bom.codigo || '';
      const descricao = bom.descricao || '';
      await saveOrdemProducao({
        ...formData,
        bom_aplicado_id: bom.id,
        bom_aplicado_desc: (codigo || '') + ' - ' + (descricao || '')
      });
      await loadDetails(formData.id);
    } catch (e: any) {
      logger.error('[Indústria][OP] Falha ao salvar referência de BOM no cabeçalho', e, { ordemId: formData.id, bomId: bom?.id });
      addToast('BOM aplicada, mas erro ao salvar referência no cabeçalho.', 'warning');
      await loadDetails(formData.id);
    }
  };

  const handleRoteiroApplied = async (roteiro: any) => {
    if (!formData.id) return;
    try {
      await saveOrdemProducao({
        ...formData,
        roteiro_aplicado_id: roteiro.id,
        roteiro_aplicado_desc: (roteiro.codigo || '') + ' - ' + (roteiro.descricao || '')
      });
      await loadDetails(formData.id);
      addToast('Roteiro vinculado com sucesso! Libere a OP para gerar as etapas.', 'success');
    } catch (e: any) {
      addToast('Erro ao vincular roteiro: ' + e.message, 'error');
    }
  };

  const doLiberar = async () => {
    if (!formData.id) return;
    if (!formData.roteiro_aplicado_id) {
      addToast('A ordem precisa ter um roteiro aplicado para ser liberada.', 'error');
      return;
    }

    try {
      setIsSaving(true);
      await saveOrdemProducao({ ...formData, status: 'em_producao' });
      await gerarOperacoes(formData.id);

      addToast('Ordem liberada e operações geradas!', 'success');
      await loadDetails(formData.id);
      setActiveTab('operacoes');
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCriarRevisao = async () => {
    if (!formData.id) return;
    const ok = await confirm({
      title: 'Criar revisão',
      description: 'Criar uma revisão desta OP? Uma nova OP em rascunho será criada para você ajustar e liberar novamente.',
      confirmText: 'Criar revisão',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      const cloned = await cloneOrdemProducao(formData.id);
      addToast('Revisão criada.', 'success');
      onSaveSuccess();
      onOpenOrder?.(cloned.id);
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível criar a revisão.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status === 'concluida' || formData.status === 'cancelada';
  const isRoleReadOnly = !canEdit;
  const isLockedEffective = isLocked || isRoleReadOnly;
  const isWizard = !ordemId && !formData.id;
  const isReleased = formData.status === 'em_producao' || formData.status === 'em_inspecao';
  const hasOperacoes = Array.isArray((formData as any).operacoes) && (formData as any).operacoes.length > 0;
  const isCoreHeaderLocked = isLockedEffective || isReleased || (formData.status as any) === 'parcialmente_concluida' || hasOperacoes;
  const canLiberar = canEdit && !!formData.id && !isLockedEffective && (formData.status === 'rascunho' || formData.status === 'planejada') && !!formData.roteiro_aplicado_id;
  const componentesCount = Array.isArray(formData.componentes) ? formData.componentes.length : 0;
  const checklist = [
    {
      label: 'Produto e quantidade definidos',
      status: formData.produto_final_id && (formData.quantidade_planejada || 0) > 0 ? 'ok' : 'error',
      details: !formData.produto_final_id
        ? 'Selecione o produto final.'
        : (formData.quantidade_planejada || 0) <= 0
          ? 'A quantidade deve ser maior que zero.'
          : undefined,
    },
    {
      label: 'Roteiro aplicado',
      status: formData.roteiro_aplicado_id ? 'ok' : 'error',
      details: formData.roteiro_aplicado_id ? formData.roteiro_aplicado_desc || undefined : 'Selecione um roteiro para liberar.',
    },
    {
      label: 'BOM / Insumos',
      status: componentesCount > 0 ? 'ok' : 'warn',
      details: componentesCount > 0 ? `${componentesCount} item(ns) em insumos/componentes.` : 'Sem insumos definidos (você pode definir depois, mas é recomendável).',
    },
  ] as const;
  const hasChecklistError = checklist.some(i => i.status === 'error');

  const canGoNextWizardStep = () => {
    if (wizardStep === 0) return !!formData.produto_final_id && !!formData.quantidade_planejada && formData.quantidade_planejada > 0;
    return true;
  };

  return (
    <>
    <div className="flex flex-col h-full bg-white">
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between py-4 px-6 bg-gray-50 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {formData.numero ? 'Ordem ' + formatOrderNumber(formData.numero) : 'Nova Ordem de Produção'}
            </h2>
            <p className="text-sm text-gray-500">Industrialização</p>
          </div>
          {formData.status && (
            <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase ${formData.status === 'concluida' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'} `}>
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
              } `}
          >
            Dados Gerais
          </button>
          <button
            onClick={() => setActiveTab('componentes')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'componentes'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } `}
            disabled={!formData.id}
          >
            Roteiro e Insumos (BOM)
          </button>
          <button
            onClick={() => setActiveTab('operacoes')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'operacoes'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } `}
            disabled={!formData.id}
          >
            Operações
          </button>
          <button
            onClick={() => setActiveTab('entregas')}
            className={`relative whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'entregas'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } `}
            disabled={!formData.id}
          >
            Entregas ({formData.entregas?.length || 0})
            {entregaBloqueada?.blocked && (
              <span className="absolute -top-1 -right-2 text-rose-600">
                <ShieldAlert size={14} />
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'historico'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } `}
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
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Wizard de Industrialização</div>
                    <div className="text-sm text-blue-900">
                      Passo {wizardStep + 1} de 3 • {wizardStep === 0 ? 'Produto e quantidade' : wizardStep === 1 ? 'Programação e parâmetros' : 'Revisão'}
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
            <Section title="O que produzir?" description="Definição do produto e quantidades.">
              <div className="sm:col-span-2">
                <Select
                  label="Tipo de Ordem"
                  name="tipo_ordem"
                  value="industrializacao"
                  disabled={!!formData.id || !allowTipoOrdemChange}
                  onChange={async (e) => {
                    const nextTipo = e.target.value as 'industrializacao' | 'beneficiamento';
                    if (nextTipo === 'industrializacao') return;
                    if (!!formData.id || !allowTipoOrdemChange) return;

                    const hasAnyData =
                      !!formData.produto_final_id ||
                      !!formData.quantidade_planejada ||
                      !!formData.documento_ref ||
                      !!formData.observacoes;

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
                >
                  <option value="industrializacao">Industrialização</option>
                  <option value="beneficiamento">Beneficiamento</option>
                </Select>
              </div>
              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Produto Final</label>
                {formData.id ? (
                  <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                    {formData.produto_nome}
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
                  disabled={isCoreHeaderLocked}
                />
              </div>
              <div className="sm:col-span-1">
                <Select
                  label="Unidade"
                  name="unidade"
                  value={formData.unidade || ''}
                  onChange={e => handleHeaderChange('unidade', e.target.value)}
                  disabled={isCoreHeaderLocked}
                >
                  <option value="">Selecione...</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.sigla}>{u.sigla} - {u.descricao}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Select label="Origem" name="origem" value={formData.origem_ordem} onChange={e => handleHeaderChange('origem_ordem', e.target.value)} disabled={isLockedEffective}>
                  <option value="manual">Manual</option>
                  <option value="venda">Venda</option>
                  <option value="reposicao">Reposição</option>
                  <option value="mrp">MRP</option>
                </Select>
              </div>
            </Section>

            {(!isWizard || wizardStep >= 1) && (
              <>
                <Section title="Programação" description="Prazos e status.">
                  <div className="sm:col-span-2">
                    <Select label="Status" name="status" value={formData.status} onChange={e => handleHeaderChange('status', e.target.value)} disabled={isLockedEffective}>
                      <option value="rascunho">Rascunho</option>
                      <option value="planejada">Planejada</option>
                      <option value="em_programacao">Em Programação</option>
                      <option value="em_producao">Em Produção</option>
                      <option value="em_inspecao">Em Inspeção</option>
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

                <Section title="Parâmetros da OP" description="Configurações de produção.">
                  <div className="sm:col-span-2">
                    <Input
                      label="Lote de Produção"
                      name="lote"
                      value={formData.lote_producao || ''}
                      onChange={e => handleHeaderChange('lote_producao', e.target.value)}
                      disabled={isLockedEffective}
                      placeholder="Ex: LOTE-2025-001"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Select
                      label="Reserva de Estoque"
                      name="reserva"
                      value={formData.reserva_modo || 'ao_liberar'}
                      onChange={e => handleHeaderChange('reserva_modo', e.target.value)}
                      disabled={isLockedEffective}
                    >
                      <option value="ao_liberar">Ao Liberar (Padrão)</option>
                      <option value="ao_planejar">Ao Planejar</option>
                      <option value="sem_reserva">Sem Reserva</option>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      label="Tolerância Overrun (%)"
                      name="overrun"
                      type="number"
                      min="0"
                      max="10"
                      value={formData.tolerancia_overrun_percent || 0}
                      onChange={e => handleHeaderChange('tolerancia_overrun_percent', parseFloat(e.target.value))}
                      disabled={isLockedEffective}
                    />
                  </div>
                </Section>
              </>
            )}

            {(!isWizard || wizardStep === 2) && (
              <Section title="Outros" description="Detalhes adicionais.">
                <Input label="Ref. Documento" name="doc_ref" value={formData.documento_ref || ''} onChange={e => handleHeaderChange('documento_ref', e.target.value)} disabled={isLockedEffective} className="sm:col-span-2" placeholder="Pedido, Lote..." />
                <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLockedEffective} className="sm:col-span-6" />
              </Section>
            )}
          </>
        )
        }

        {
          activeTab === 'componentes' && (
            <>
              {!isLockedEffective && formData.id && formData.produto_final_id && (
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <p className="text-sm text-blue-800">
                      {formData.roteiro_aplicado_desc
                        ? <>Roteiro: <strong>{formData.roteiro_aplicado_desc}</strong></>
                        : 'Nenhum roteiro aplicado.'}
                    </p>
                    <RoteiroSelector
                      ordemId={formData.id}
                      produtoId={formData.produto_final_id}
                      disabled={isReleased || isLockedEffective}
                      onApplied={handleRoteiroApplied}
                    />
                  </div>

                  <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <p className="text-sm text-blue-800">
                      {formData.bom_aplicado_desc
                        ? <>BOM: <strong>{formData.bom_aplicado_desc}</strong></>
                        : 'Nenhuma BOM aplicada.'}
                    </p>
                    <BomSelector
                      ordemId={formData.id}
                      produtoId={formData.produto_final_id}
                      tipoOrdem="producao"
                      disabled={isReleased || isLockedEffective}
                      onApplied={handleBomApplied}
                    />
                  </div>
                </div>
              )}
              <OrdemFormItems
                ordemId={formData.id}
                items={formData.componentes || []}
                onAddItem={handleAddComponente}
                onRemoveItem={handleRemoveComponente}
                onUpdateItem={handleUpdateComponente}
                onRefresh={() => loadDetails(formData.id)}
                isAddingItem={false}
                readOnly={isLockedEffective}
                highlightItemId={highlightComponenteId}
              />
            </>
          )
        }

        {
          activeTab === 'operacoes' && formData.id && (
            <OperacoesGrid
              ordemId={formData.id}
              highlightOperacaoId={highlightOperacaoId}
              canOperate={canOperate && !isLockedEffective}
              canConfigureQa={canConfigureQa && !isLockedEffective}
              canReset={canAdmin && !isLockedEffective}
            />
          )
        }

        {
          activeTab === 'entregas' && (
            <div className="space-y-4">
              {entregaBloqueada?.blocked && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <ShieldAlert size={18} />
                  <div>
                    <p className="font-semibold">Entrega bloqueada por Qualidade</p>
                    <p>{entregaBloqueada.reason}</p>
                  </div>
                </div>
              )}
              <OrdemEntregas
                entregas={formData.entregas || []}
                onAddEntrega={handleAddEntrega}
                onRemoveEntrega={handleRemoveEntrega}
                readOnly={isLockedEffective || entregaBloqueada?.blocked}
                maxQuantity={formData.quantidade_planejada || 0}
                showBillingStatus={false}
                highlightEntregaId={highlightEntregaId}
              />
            </div>
          )
        }

        {activeTab === 'historico' && (
          formData.id ? (
            <IndustriaAuditTrailPanel
              ordemId={formData.id}
              tables={[
                'industria_producao_ordens',
                'industria_producao_componentes',
                'industria_producao_entregas',
                'industria_producao_operacoes',
              ]}
              onNavigate={(row) => {
                if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
                setHighlightComponenteId(null);
                setHighlightEntregaId(null);
                setHighlightOperacaoId(null);

                const targetId =
                  row.record_id ||
                  (typeof row.new_data?.id === 'string' ? (row.new_data.id as string) : null) ||
                  (typeof row.old_data?.id === 'string' ? (row.old_data.id as string) : null);

                const tableName = row.table_name || '';

                if (tableName === 'industria_producao_ordens') setActiveTab('dados');
                else if (tableName === 'industria_producao_componentes' || tableName.includes('componentes')) {
                  setActiveTab('componentes');
                  if (targetId) setHighlightComponenteId(targetId);
                }
                else if (tableName === 'industria_producao_entregas' || tableName.includes('entregas')) {
                  setActiveTab('entregas');
                  if (targetId) setHighlightEntregaId(targetId);
                }
                else if (tableName === 'industria_producao_operacoes' || tableName.includes('operacoes')) {
                  setActiveTab('operacoes');
                  if (targetId) setHighlightOperacaoId(targetId);
                }
                else setActiveTab('dados');

                highlightTimerRef.current = window.setTimeout(() => {
                  setHighlightComponenteId(null);
                  setHighlightEntregaId(null);
                  setHighlightOperacaoId(null);
                }, 4500);
              }}
            />
          ) : (
            <div className="text-sm text-gray-500">Salve a ordem para visualizar o histórico.</div>
          )
        )}
      </div >

      <div className="flex justify-between p-4 border-t bg-gray-50 rounded-b-lg">
        {formData.id && !isLockedEffective && canAdmin && formData.status === 'rascunho' ? (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: 'Excluir OP',
                description: 'Tem certeza que deseja excluir esta Ordem de Produção? Esta ação não pode ser desfeita.',
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                variant: 'danger',
              });
              if (!ok) return;

              setIsSaving(true);
              try {
                await deleteOrdemProducao(formData.id!);
                const stillThere = await getOrdemProducaoDetails(formData.id!);
                if (stillThere) {
                  throw new Error(
                    'O sistema confirmou a exclusão, mas a ordem ainda existe. Verifique permissões/empresa ativa e tente novamente.'
                  );
                }
                addToast('Ordem excluída com sucesso!', 'success');
                onClose();
                if (onSaveSuccess) onSaveSuccess();
              } catch (e: any) {
                const raw = String(e?.message || '');
                const msg = raw.toLowerCase();

                if (msg.includes('sem permissão') || msg.includes('permission denied') || msg.includes('42501')) {
                  addToast(
                    'Sem permissão para excluir esta OP. Confirme se você está como admin/owner na empresa ativa.',
                    'error'
                  );
                } else if (msg.includes('somente ordens em rascunho')) {
                  addToast('Só é possível excluir OP em rascunho. Para ordens já liberadas, cancele a OP.', 'error');
                } else if (msg.includes('já possui operações')) {
                  addToast('Não é possível excluir: a OP já possui operações geradas.', 'error');
                } else if (msg.includes('já possui entregas')) {
                  addToast('Não é possível excluir: a OP já possui entregas registradas.', 'error');
                } else if (msg.includes('violates foreign key constraint') || msg.includes('violates')) {
                  addToast(
                    'Não foi possível excluir porque existem registros vinculados (ex.: inspeções/qualidade).',
                    'error'
                  );
                } else {
                  addToast('Erro ao excluir ordem: ' + raw, 'error');
                }
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            Excluir OP
          </button>
        ) : <div></div>}

        <div className="flex space-x-2">
          {formData.id && canAdmin && ['rascunho', 'planejada', 'em_programacao'].includes(formData.status as string) && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reverter OP (remover operações)',
                  description:
                    'Use apenas se as operações foram geradas por engano. Remove operações/reservas e retorna a OP para Rascunho. Não pode haver entregas ou apontamentos.',
                  confirmText: 'Reverter',
                  cancelText: 'Cancelar',
                  variant: 'warning',
                });
                if (!ok || !formData.id) return;

                setIsResetting(true);
                try {
                  await resetOrdemProducao(formData.id);
                  await loadDetails(formData.id);
                  addToast('OP revertida: operações removidas e status em rascunho.', 'success');
                  if (onSaveSuccess) onSaveSuccess();
                  setActiveTab('dados');
                } catch (e: any) {
                  const msg = String(e?.message || '');
                  addToast('Erro ao reverter OP: ' + msg, 'error');
                } finally {
                  setIsResetting(false);
                }
              }}
              disabled={isSaving || isResetting}
              className="inline-flex items-center px-4 py-2 border border-amber-300 rounded-md shadow-sm text-sm font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
            >
              Reverter OP
            </button>
          )}

          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Fechar
          </button>

          {formData.id && isCoreHeaderLocked && (
            <button
              type="button"
              onClick={handleCriarRevisao}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-amber-200 rounded-md shadow-sm text-sm font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
              title="Cria uma nova OP em rascunho para ajustar após a liberação."
            >
              <Save size={20} className="mr-2" />
              Criar revisão
            </button>
          )}

          {formData.id && (formData.status === 'rascunho' || formData.status === 'planejada') && (
            <button
              onClick={() => setShowLiberarModal(true)}
              disabled={isSaving || !canLiberar}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <Play size={20} className="mr-2" />
              Liberar OP
            </button>
          )}

          {formData.id && (formData.status === 'em_producao' || (formData.status as any) === 'parcialmente_concluida') && (
            <button
              onClick={() => setShowClosureModal(true)}
              disabled={isSaving || !canAdmin}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              Encerrar Ordem (Backflush)
            </button>
          )}

          {!isLockedEffective && canEdit && !isWizard && (
            <button
              onClick={handleSaveHeader}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Save size={20} className="mr-2" />
              Salvar
            </button>
          )}

          {!isLockedEffective && canEdit && isWizard && (
            <>
              {wizardStep > 0 && (
                <button
                  type="button"
                  onClick={() => setWizardStep(s => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <ArrowLeft size={18} className="mr-2" />
                  Voltar
                </button>
              )}

              {wizardStep < 2 ? (
                <button
                  type="button"
                  disabled={!canGoNextWizardStep()}
                  onClick={() => setWizardStep(s => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s))}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Próximo
                  <ArrowRight size={18} className="ml-2" />
                </button>
              ) : (
                <button
                  onClick={handleSaveHeader}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <Save size={20} className="mr-2" />
                  Salvar e continuar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div >

    <Modal
      isOpen={showLiberarModal}
      onClose={() => setShowLiberarModal(false)}
      title="Liberar OP (Checklist)"
      size="lg"
    >
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-800">Resumo</div>
          <div className="mt-2 text-sm text-gray-700">
            <div><span className="font-medium">Produto:</span> {formData.produto_nome || '—'}</div>
            <div><span className="font-medium">Quantidade:</span> {formData.quantidade_planejada || 0} {formData.unidade || ''}</div>
            <div><span className="font-medium">Roteiro:</span> {formData.roteiro_aplicado_desc || '—'}</div>
            <div><span className="font-medium">BOM:</span> {formData.bom_aplicado_desc || (componentesCount > 0 ? 'Componentes manuais' : '—')}</div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Ao liberar, o sistema irá gerar as operações e travar os campos críticos do cabeçalho (produto/quantidade/unidade) e o roteiro/BOM desta OP.
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-800">Checklist</div>
          <div className="mt-3 space-y-2">
            {checklist.map((item) => (
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
            onClick={() => setShowLiberarModal(false)}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={isSaving || hasChecklistError || !canLiberar}
            onClick={async () => {
              setShowLiberarModal(false);
              await doLiberar();
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            <Play size={18} className="mr-2" />
            Liberar e gerar operações
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
}
  const checkEntregaBlocked = (ordem: OrdemProducaoDetails | null): { blocked: boolean; reason?: string } => {
    if (!ordem) return { blocked: false };
    if (!ordem.operacoes || ordem.operacoes.length === 0) return { blocked: false };
    const pendente = ordem.operacoes.some(op => {
      if (!op.require_if) return false;
      if (op.if_status === 'aprovada') return false;
      return true;
    });
    if (pendente) {
      return {
        blocked: true,
        reason: 'Inspeção Final pendente nesta OP. Libere a IF antes de registrar entrega.'
      };
    }
    return { blocked: false };
  };
