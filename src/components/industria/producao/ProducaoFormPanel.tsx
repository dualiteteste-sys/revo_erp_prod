import React, { useState, useEffect } from 'react';
import { Loader2, Save, Play } from 'lucide-react';
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
  fecharOrdemProducao
} from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
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

interface Props {
  ordemId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function ProducaoFormPanel({ ordemId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!ordemId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes' | 'entregas' | 'operacoes'>('dados');
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);
  const [showClosureModal, setShowClosureModal] = useState(false);

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
    listUnidades().then(setUnidades).catch(console.error);
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
      setFormData(data);
    } catch (e) {
      console.error(e);
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
      currentId = await handleSaveHeader();
      if (!currentId) return;
    }

    try {
      await manageComponenteProducao(currentId!, null, item.id, 1, 'un', 'upsert');
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
      console.error(e);
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

  const handleLiberar = async () => {
    if (!formData.id) return;
    if (!formData.roteiro_aplicado_id) {
      addToast('A ordem precisa ter um roteiro aplicado para ser liberada.', 'error');
      return;
    }

    if (!confirm('Deseja liberar a ordem? Isso irá gerar as operações de produção.')) return;

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

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status === 'concluida' || formData.status === 'cancelada';

  return (
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
            BOM (Insumos)
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
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'entregas'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } `}
            disabled={!formData.id}
          >
            Entregas ({formData.entregas?.length || 0})
          </button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'dados' && (
          <>
            <Section title="O que produzir?" description="Definição do produto e quantidades.">
              <div className="sm:col-span-2">
                <Select label="Tipo de Ordem" name="tipo_ordem" value="industrializacao" disabled>
                  <option value="industrializacao">Industrialização</option>
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
                  disabled={isLocked}
                />
              </div>
              <div className="sm:col-span-1">
                <Select
                  label="Unidade"
                  name="unidade"
                  value={formData.unidade || ''}
                  onChange={e => handleHeaderChange('unidade', e.target.value)}
                  disabled={isLocked}
                >
                  <option value="">Selecione...</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.sigla}>{u.sigla} - {u.descricao}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Select label="Origem" name="origem" value={formData.origem_ordem} onChange={e => handleHeaderChange('origem_ordem', e.target.value)} disabled={isLocked}>
                  <option value="manual">Manual</option>
                  <option value="venda">Venda</option>
                  <option value="reposicao">Reposição</option>
                  <option value="mrp">MRP</option>
                </Select>
              </div>
            </Section>

            <Section title="Programação" description="Prazos e status.">
              <div className="sm:col-span-2">
                <Select label="Status" name="status" value={formData.status} onChange={e => handleHeaderChange('status', e.target.value)} disabled={isLocked}>
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
                  disabled={isLocked}
                />
              </div>
              <div className="sm:col-span-2"></div>

              <Input label="Início Previsto" type="date" value={formData.data_prevista_inicio || ''} onChange={e => handleHeaderChange('data_prevista_inicio', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
              <Input label="Fim Previsto" type="date" value={formData.data_prevista_fim || ''} onChange={e => handleHeaderChange('data_prevista_fim', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
              <Input label="Entrega Prevista" type="date" value={formData.data_prevista_entrega || ''} onChange={e => handleHeaderChange('data_prevista_entrega', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
            </Section>

            <Section title="Parâmetros da OP" description="Configurações de produção.">
              <div className="sm:col-span-2">
                <Input
                  label="Lote de Produção"
                  name="lote"
                  value={formData.lote_producao || ''}
                  onChange={e => handleHeaderChange('lote_producao', e.target.value)}
                  disabled={isLocked}
                  placeholder="Ex: LOTE-2025-001"
                />
              </div>
              <div className="sm:col-span-2">
                <Select
                  label="Reserva de Estoque"
                  name="reserva"
                  value={formData.reserva_modo || 'ao_liberar'}
                  onChange={e => handleHeaderChange('reserva_modo', e.target.value)}
                  disabled={isLocked}
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
                  disabled={isLocked}
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Roteiro Aplicado</label>
                <div className="flex items-center gap-2">
                  <div className="flex-grow p-2 bg-gray-100 border border-gray-300 rounded text-sm text-gray-600">
                    {formData.roteiro_aplicado_desc || 'Nenhum roteiro aplicado.'}
                  </div>
                  {!isLocked && formData.id && formData.produto_final_id && (
                    <RoteiroSelector
                      ordemId={formData.id}
                      produtoId={formData.produto_final_id}
                      onApplied={handleRoteiroApplied}
                    />
                  )}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">BOM Aplicada</label>
                <div className="flex items-center gap-2">
                  <div className="flex-grow p-2 bg-gray-100 border border-gray-300 rounded text-sm text-gray-600">
                    {formData.bom_aplicado_desc || 'Nenhuma BOM aplicada.'}
                  </div>
                  {!isLocked && formData.id && formData.produto_final_id && (
                    <BomSelector
                      ordemId={formData.id}
                      produtoId={formData.produto_final_id}
                      tipoOrdem="producao"
                      onApplied={handleBomApplied}
                    />
                  )}
                </div>
              </div>
            </Section>

            <Section title="Outros" description="Detalhes adicionais.">
              <Input label="Ref. Documento" name="doc_ref" value={formData.documento_ref || ''} onChange={e => handleHeaderChange('documento_ref', e.target.value)} disabled={isLocked} className="sm:col-span-2" placeholder="Pedido, Lote..." />
              <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLocked} className="sm:col-span-6" />
            </Section>
          </>
        )}

        {activeTab === 'componentes' && (
          <>
            {!isLocked && formData.id && formData.produto_final_id && (
              <div className="mb-4 flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800">
                  {formData.bom_aplicado_desc
                    ? <>BOM atual: <strong>{formData.bom_aplicado_desc}</strong></>
                    : 'Nenhuma BOM aplicada.'}
                </p>
                <BomSelector
                  ordemId={formData.id}
                  produtoId={formData.produto_final_id}
                  tipoOrdem="producao"
                  onApplied={handleBomApplied}
                />
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
              readOnly={isLocked}
            />
          </>
        )}

        {activeTab === 'operacoes' && formData.id && (
          <OperacoesGrid ordemId={formData.id} />
        )}

        {activeTab === 'entregas' && (
          <OrdemEntregas
            entregas={formData.entregas || []}
            onAddEntrega={handleAddEntrega}
            onRemoveEntrega={handleRemoveEntrega}
            readOnly={isLocked}
            maxQuantity={formData.quantidade_planejada || 0}
            showBillingStatus={false}
          />
        )}
      </div>

      <div className="flex justify-between p-4 border-t bg-gray-50 rounded-b-lg">
        {formData.id && !isLocked ? (
          <button
            onClick={async () => {
              if (confirm('Tem certeza que deseja excluir esta Ordem de Produção? Esta ação não pode ser desfeita.')) {
                setIsSaving(true);
                try {
                  await deleteOrdemProducao(formData.id!);
                  addToast('Ordem excluída com sucesso!', 'success');
                  onClose();
                  if (onSaveSuccess) onSaveSuccess();
                } catch (e: any) {
                  addToast('Erro ao excluir ordem: ' + e.message, 'error');
                } finally {
                  setIsSaving(false);
                }
              }
            }}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            Excluir OP
          </button>
        ) : <div></div>}

        <div className="flex space-x-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Fechar
          </button>

          {formData.id && (formData.status === 'rascunho' || formData.status === 'planejada') && (
            <button
              onClick={handleLiberar}
              disabled={isSaving || !formData.roteiro_aplicado_id}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <Play size={20} className="mr-2" />
              Liberar OP
            </button>
          )}

          {formData.id && (formData.status === 'em_producao' || (formData.status as any) === 'parcialmente_concluida') && (
            <button
              onClick={() => setShowClosureModal(true)}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              Encerrar Ordem (Backflush)
            </button>
          )}

          <button
            onClick={handleSaveHeader}
            disabled={isSaving || isLocked}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
