import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { OrdemIndustriaDetails, OrdemPayload, saveOrdem, getOrdemDetails, manageComponente, manageEntrega, OrdemEntrega } from '@/services/industria';
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
import { formatOrderNumber } from '@/lib/utils';
import { ensureMaterialClienteV2 } from '@/services/industriaMateriais';
import type { MaterialClienteListItem } from '@/services/industriaMateriais';

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
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function OrdemFormPanel({ ordemId, initialTipoOrdem, initialPrefill, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!ordemId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes' | 'entregas'>('dados');
  const [materialCliente, setMaterialCliente] = useState<MaterialClienteListItem | null>(null);

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
        observacoes: formData.observacoes
      };

      const saved = await saveOrdem(payload);
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
            <Section title="Planejamento" description="O que será produzido e para quem.">
              <div className="sm:col-span-2">
                <Select label="Tipo de Ordem" name="tipo_ordem" value={formData.tipo_ordem} onChange={e => handleHeaderChange('tipo_ordem', e.target.value)} disabled={!!formData.id}>
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
                    {!isLocked && (
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
                  disabled={isLocked}
                />
              </div>
              <div className="sm:col-span-1">
                <Input
                  label="Unidade"
                  name="unidade"
                  value={formData.unidade || ''}
                  onChange={e => handleHeaderChange('unidade', e.target.value)}
                  disabled={isLocked}
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
                  disabled={isLocked}
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

            <Section title="Outros" description="Detalhes adicionais.">
              <Input label="Ref. Documento" name="doc_ref" value={formData.documento_ref || ''} onChange={e => handleHeaderChange('documento_ref', e.target.value)} disabled={isLocked} className="sm:col-span-2" placeholder="Pedido, Lote..." />
              <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLocked} className="sm:col-span-6" />
            </Section>
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
                  onApplied={() => loadDetails(formData.id)}
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
          {!isLocked && (
            <button
              onClick={handleSaveHeader}
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
