import React, { useState, useEffect } from 'react';
import { Loader2, Save, Link as LinkIcon, PlusCircle, AlertTriangle } from 'lucide-react';
import { OrdemBeneficiamentoDetails, OrdemBeneficiamentoPayload, saveOrdemBeneficiamento, getOrdemBeneficiamentoDetails, manageComponenteBenef, manageEntregaBenef } from '@/services/industriaBeneficiamento';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ServiceAutocomplete from '@/components/common/ServiceAutocomplete';
import OrdemFormItems from '../ordens/OrdemFormItems';
import OrdemEntregas from '../ordens/OrdemEntregas';
import BomSelector from '../ordens/BomSelector';
import { Service } from '@/services/services';
import { formatOrderNumber } from '@/lib/utils';
import { getPartners, PartnerDetails } from '@/services/partners';
import Modal from '@/components/ui/Modal';
import PartnerFormPanel from '@/components/partners/PartnerFormPanel';
import { fetchCnpjData } from '@/services/externalApis';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { ensureMaterialCliente } from '@/services/industriaMateriais';
import { OsItemSearchResult } from '@/services/os';
import { OrdemEntrega } from '@/services/industria';

interface Props {
  ordemId: string | null;
  initialData?: any;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function BeneficiamentoFormPanel({ ordemId, initialData, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!ordemId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes' | 'entregas'>('dados');
  
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientModalData, setClientModalData] = useState<PartnerDetails | null>(null);

  const [selectedProduto, setSelectedProduto] = useState<{id: string, nome: string, unidade: string} | null>(null);

  const [formData, setFormData] = useState<Partial<OrdemBeneficiamentoDetails>>({
    status: 'rascunho',
    prioridade: 0,
    unidade: 'un',
    quantidade_planejada: 0,
    usa_material_cliente: true,
    componentes: [],
    entregas: []
  });

  useEffect(() => {
    if (ordemId) {
      loadDetails();
    } else if (initialData) {
        const { recebimento, item } = initialData;
        
        setFormData(prev => ({
            ...prev,
            quantidade_planejada: item.quantidade,
            unidade: item.unidade,
            documento_ref: recebimento.numero ? `NF ${recebimento.numero}` : undefined,
            produto_material_cliente_id: null,
            produto_material_nome: item.produto_nome,
        }));

        if (item.produto_id) {
            setSelectedProduto({
                id: item.produto_id,
                nome: item.produto_nome,
                unidade: item.unidade
            });
        }

        if (recebimento.emitente_nome) {
            getPartners({ 
                page: 1, 
                pageSize: 1, 
                searchTerm: recebimento.emitente_nome, 
                filterType: 'cliente', 
                sortBy: { column: 'nome', ascending: true } 
            }).then(async res => {
                if (res.data.length > 0) {
                    const client = res.data[0];
                    setFormData(prev => ({
                        ...prev,
                        cliente_id: client.id,
                        cliente_nome: client.nome
                    }));
                    addToast(`Cliente "${client.nome}" vinculado automaticamente.`, 'info');
                } else {
                    addToast(`Cliente "${recebimento.emitente_nome}" não encontrado. Buscando dados completos...`, 'info');
                    
                    let partnerData: Partial<PartnerDetails> = {
                        nome: recebimento.emitente_nome,
                        doc_unico: recebimento.emitente_cnpj,
                        tipo: 'cliente',
                        tipo_pessoa: 'juridica',
                        isento_ie: false,
                        contribuinte_icms: '9',
                        enderecos: [],
                        contatos: []
                    };

                    if (recebimento.emitente_cnpj) {
                        try {
                            const cnpjData = await fetchCnpjData(recebimento.emitente_cnpj);
                            partnerData = {
                                ...partnerData,
                                nome: cnpjData.razao_social || partnerData.nome,
                                fantasia: cnpjData.nome_fantasia,
                                telefone: cnpjData.ddd_telefone_1,
                                enderecos: [{
                                    tipo_endereco: 'PRINCIPAL',
                                    logradouro: cnpjData.logradouro,
                                    numero: cnpjData.numero,
                                    complemento: cnpjData.complemento,
                                    bairro: cnpjData.bairro,
                                    cidade: cnpjData.municipio,
                                    uf: cnpjData.uf,
                                    cep: cnpjData.cep,
                                    pais: 'Brasil'
                                }]
                            };
                            addToast('Dados do cliente preenchidos via CNPJ.', 'success');
                        } catch (e) {
                            console.warn('Falha ao buscar dados do CNPJ:', e);
                            addToast('Não foi possível buscar dados adicionais do CNPJ. Preencha manualmente.', 'warning');
                        }
                    }

                    setClientModalData(partnerData as PartnerDetails);
                    setIsClientModalOpen(true);
                }
            });
        }
    }
  }, [ordemId, initialData]);

  const loadDetails = async (idOverride?: string) => {
    const idToLoad = idOverride || ordemId || formData.id;
    if (!idToLoad) return;

    try {
      const data = await getOrdemBeneficiamentoDetails(idToLoad);
      setFormData(data);
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar ordem.', 'error');
      if (ordemId) onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof OrdemBeneficiamentoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleServiceSelect = (id: string | null, service?: Service) => {
    handleHeaderChange('produto_servico_id', id);
    if (service) {
        handleHeaderChange('produto_servico_nome', service.descricao);
        if (service.unidade) {
            handleHeaderChange('unidade', service.unidade);
        }
    }
  };

  const handleProductSelect = (item: OsItemSearchResult) => {
    if (item.type !== 'product') {
        addToast('Selecione um produto, não um serviço.', 'warning');
        return;
    }
    setSelectedProduto({
        id: item.id,
        nome: item.descricao,
        unidade: item.unidade || 'un'
    });
    handleHeaderChange('produto_material_nome', item.descricao);
    handleHeaderChange('produto_material_cliente_id', null);
  };

  const handleSaveAll = async () => {
    if (!formData.cliente_id) {
      addToast('Selecione um cliente.', 'error');
      return;
    }
    if (!formData.produto_servico_id) {
      addToast('Selecione o serviço de beneficiamento.', 'error');
      return;
    }
    if (!formData.quantidade_planejada || formData.quantidade_planejada <= 0) {
      addToast('A quantidade planejada deve ser maior que zero.', 'error');
      return;
    }
    
    setIsSaving(true);
    try {
        // 1. Ensure Material Link
        let materialClienteId = formData.produto_material_cliente_id;
        
        // Se usa material e não tem ID vinculado, mas tem produto selecionado na UI, tenta vincular
        if (formData.usa_material_cliente && !materialClienteId && selectedProduto) {
            try {
                materialClienteId = await ensureMaterialCliente(
                    formData.cliente_id,
                    selectedProduto.id,
                    selectedProduto.nome,
                    selectedProduto.unidade
                );
                handleHeaderChange('produto_material_cliente_id', materialClienteId);
            } catch (err: any) {
                throw new Error(`Erro ao vincular material ao cliente: ${err.message}`);
            }
        }

        // Validação final: Se usa material, não tem ID (nem conseguiu criar) e status avança -> Erro
        if (formData.usa_material_cliente && !materialClienteId && formData.status !== 'rascunho') {
            throw new Error('Selecione o material a ser beneficiado para avançar o status.');
        }

      // 2. Save Header
      const payload: OrdemBeneficiamentoPayload = {
        id: formData.id,
        cliente_id: formData.cliente_id,
        produto_servico_id: formData.produto_servico_id,
        produto_material_cliente_id: formData.usa_material_cliente ? materialClienteId : null,
        usa_material_cliente: formData.usa_material_cliente,
        quantidade_planejada: formData.quantidade_planejada,
        unidade: formData.unidade,
        status: formData.status,
        prioridade: formData.prioridade,
        data_prevista_entrega: formData.data_prevista_entrega,
        pedido_cliente_ref: formData.pedido_cliente_ref,
        lote_cliente: formData.lote_cliente,
        documento_ref: formData.documento_ref,
        observacoes: formData.observacoes
      };

      const saved = await saveOrdemBeneficiamento(payload);
      const savedId = saved.id;

      // 3. Save Deliveries (Batch-like)
      // Filter for new deliveries (no real ID or temporary ID)
      const newDeliveries = formData.entregas?.filter(e => !e.id || e.id.startsWith('temp-')) || [];
      
      if (newDeliveries.length > 0) {
        const deliveryPromises = newDeliveries.map(d => 
            manageEntregaBenef(
                savedId,
                null,
                d.data_entrega,
                d.quantidade_entregue,
                d.status_faturamento || 'nao_faturado',
                d.documento_entrega,
                d.documento_faturamento,
                d.observacoes,
                'upsert'
            )
        );
        await Promise.all(deliveryPromises);
      }

      // Reload to get fresh state (IDs, totals)
      await loadDetails(savedId);
      
      addToast('Ordem salva com sucesso!', 'success');
      return savedId;

    } catch (e: any) {
      console.error('Erro ao salvar OB:', e);
      let errorMessage = e.message || 'Erro ao salvar a ordem.';
      if (errorMessage.includes('Material do cliente inválido')) {
        errorMessage = 'Erro de validação do material. Tente selecionar o produto novamente.';
      }
      addToast(errorMessage, 'error');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComponente = async (item: any) => {
    let currentId = formData.id;
    if (!currentId) {
      currentId = await handleSaveAll();
      if (!currentId) return;
    }
    try {
      await manageComponenteBenef(currentId!, null, item.id, 1, 'un', 'upsert');
      await loadDetails(currentId);
      addToast('Insumo adicionado.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveComponente = async (itemId: string) => {
    try {
      await manageComponenteBenef(formData.id!, itemId, '', 0, '', 'delete');
      await loadDetails(formData.id);
      addToast('Insumo removido.', 'success');
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
      await manageComponenteBenef(formData.id!, itemId, item.produto_id, updates.quantidade_planejada, updates.unidade, 'upsert');
      setFormData(prev => ({
        ...prev,
        componentes: prev.componentes?.map(c => c.id === itemId ? { ...c, ...updates } : c)
      }));
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // Local State Management for Deliveries
  const handleAddEntregaLocal = (data: Partial<OrdemEntrega>) => {
    const newEntrega: OrdemEntrega = {
        id: `temp-${Date.now()}`, // Temp ID for key
        ordem_id: formData.id || '',
        data_entrega: data.data_entrega!,
        quantidade_entregue: data.quantidade_entregue!,
        status_faturamento: data.status_faturamento,
        documento_entrega: data.documento_entrega,
        documento_faturamento: data.documento_faturamento,
        observacoes: data.observacoes,
        created_at: new Date().toISOString()
    };

    setFormData(prev => ({
        ...prev,
        entregas: [...(prev.entregas || []), newEntrega]
    }));
  };

  const handleRemoveEntrega = async (entregaId: string) => {
    // If it's a temp item, just remove from state
    if (entregaId.startsWith('temp-')) {
        setFormData(prev => ({
            ...prev,
            entregas: prev.entregas?.filter(e => e.id !== entregaId)
        }));
        return;
    }

    // If it's a persisted item, delete via API immediately (cleaner than tracking deletions)
    if (confirm('Tem certeza que deseja remover esta entrega salva?')) {
        try {
            await manageEntregaBenef(formData.id!, entregaId, '', 0, 'nao_faturado', undefined, undefined, undefined, 'delete');
            await loadDetails(formData.id); // Reload to sync
            addToast('Entrega removida.', 'success');
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    }
  };

  const handleOpenClientModal = () => {
    setClientModalData(null);
    setIsClientModalOpen(true);
  };

  const handleClientSaved = (savedPartner: PartnerDetails) => {
    setFormData(prev => ({
        ...prev,
        cliente_id: savedPartner.id,
        cliente_nome: savedPartner.nome
    }));
    setIsClientModalOpen(false);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = formData.status === 'concluida' || formData.status === 'cancelada';
  const totalEntregue = formData.entregas?.reduce((acc, e) => acc + Number(e.quantidade_entregue), 0) || 0;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/20">
        <nav className="-mb-px flex space-x-6 p-4 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('dados')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'dados' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Dados Gerais
          </button>
          <button
            onClick={() => setActiveTab('componentes')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'componentes' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            disabled={!formData.id}
          >
            Insumos Adicionais
          </button>
          <button
            onClick={() => setActiveTab('entregas')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'entregas' 
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
                {initialData && (
                    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                        <LinkIcon className="text-blue-600" size={20} />
                        <div>
                            <p className="text-sm font-bold text-blue-800">Vinculado ao Recebimento</p>
                            <p className="text-xs text-blue-600">
                                Nota: {initialData.recebimento.numero} - {initialData.recebimento.emitente_nome}
                            </p>
                        </div>
                    </div>
                )}

                <Section title="Cliente e Serviço" description="Para quem e o que será feito.">
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                        <div className="flex gap-2">
                            <div className="flex-grow">
                                <ClientAutocomplete
                                    value={formData.cliente_id || null}
                                    initialName={formData.cliente_nome}
                                    onChange={(id, name) => {
                                        handleHeaderChange('cliente_id', id);
                                        if (name) handleHeaderChange('cliente_nome', name);
                                        handleHeaderChange('produto_material_cliente_id', null);
                                        setSelectedProduto(null);
                                        handleHeaderChange('produto_material_nome', null);
                                    }}
                                    disabled={isLocked}
                                />
                            </div>
                            {!isLocked && (
                                <button
                                    onClick={handleOpenClientModal}
                                    className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                    title="Cadastrar Novo Cliente"
                                >
                                    <PlusCircle size={20} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Serviço de Beneficiamento</label>
                        {formData.id ? (
                            <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                                {formData.produto_servico_nome}
                            </div>
                        ) : (
                            <ServiceAutocomplete 
                                value={formData.produto_servico_id || null}
                                initialName={formData.produto_servico_nome}
                                onChange={handleServiceSelect}
                                disabled={isLocked}
                                placeholder="Buscar serviço..."
                            />
                        )}
                    </div>
                    <div className="sm:col-span-2">
                        <Input 
                            label="Quantidade" 
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
                    <div className="sm:col-span-6">
                        <Toggle 
                            label="Usa material do cliente" 
                            name="usa_material" 
                            checked={formData.usa_material_cliente !== false} 
                            onChange={checked => handleHeaderChange('usa_material_cliente', checked)}
                        />
                    </div>
                    {formData.usa_material_cliente && (
                        <div className="sm:col-span-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Material do Cliente (Estoque) <span className="text-red-500">*</span>
                            </label>
                            {formData.id && formData.produto_material_cliente_id ? (
                                <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                                    {formData.produto_material_nome}
                                </div>
                            ) : (
                                <div className="w-full">
                                    <ItemAutocomplete 
                                        onSelect={handleProductSelect}
                                        placeholder={!formData.cliente_id ? "Selecione um cliente primeiro" : "Buscar produto no estoque..."}
                                        disabled={isLocked || !formData.cliente_id}
                                        type="product"
                                        onlySales={false}
                                    />
                                    {selectedProduto && !formData.produto_material_cliente_id && (
                                        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                            <LinkIcon size={12} />
                                            Produto selecionado: <strong>{selectedProduto.nome}</strong>. O vínculo será criado automaticamente ao salvar.
                                        </p>
                                    )}
                                    {formData.status !== 'rascunho' && !selectedProduto && !formData.produto_material_cliente_id && (
                                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                            <AlertTriangle size={12} />
                                            Obrigatório selecionar o material para avançar o status.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Section>

                <Section title="Controle" description="Rastreabilidade e Prazos.">
                    <div className="sm:col-span-2">
                        <Select label="Status" name="status" value={formData.status} onChange={e => handleHeaderChange('status', e.target.value)} disabled={isLocked}>
                            <option value="rascunho">Rascunho</option>
                            <option value="aguardando_material">Aguardando Material</option>
                            <option value="em_beneficiamento">Em Beneficiamento</option>
                            <option value="em_inspecao">Em Inspeção</option>
                            <option value="parcialmente_entregue">Parcialmente Entregue</option>
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
                    <div className="sm:col-span-2">
                        <Input label="Entrega Prevista" type="date" value={formData.data_prevista_entrega || ''} onChange={e => handleHeaderChange('data_prevista_entrega', e.target.value)} disabled={isLocked} />
                    </div>
                    
                    <Input label="Ref. Pedido Cliente" name="ped_cli" value={formData.pedido_cliente_ref || ''} onChange={e => handleHeaderChange('pedido_cliente_ref', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
                    <Input label="Lote Cliente" name="lote_cli" value={formData.lote_cliente || ''} onChange={e => handleHeaderChange('lote_cliente', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
                    <Input label="Doc. Interno (NF Entrada)" name="doc_ref" value={formData.documento_ref || ''} onChange={e => handleHeaderChange('documento_ref', e.target.value)} disabled={isLocked} className="sm:col-span-2" />
                    
                    <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} disabled={isLocked} className="sm:col-span-6" />
                </Section>
            </>
        )}

        {activeTab === 'componentes' && (
            <>
                {!isLocked && formData.id && formData.produto_servico_id && (
                    <div className="mb-4 flex justify-end">
                        <BomSelector 
                            ordemId={formData.id} 
                            produtoId={formData.produto_servico_id} 
                            tipoOrdem="beneficiamento"
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
                onAddEntrega={handleAddEntregaLocal}
                onRemoveEntrega={handleRemoveEntrega}
                readOnly={isLocked}
                maxQuantity={formData.quantidade_planejada || 0}
                showBillingStatus={true}
            />
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-between items-center border-t border-white/20">
        <div className="text-sm text-gray-500">
            {formData.numero && `Ordem ${formatOrderNumber(formData.numero)}`}
        </div>
        <div className="flex gap-3">
            <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            Fechar
            </button>
          {!isLocked && (
            <button 
              onClick={handleSaveAll} 
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
          )}
        </div>
      </footer>

      <Modal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} title="Cadastro Rápido de Cliente" size="2xl">
        <PartnerFormPanel 
            partner={clientModalData} 
            onSaveSuccess={handleClientSaved} 
            onClose={() => setIsClientModalOpen(false)} 
        />
      </Modal>
    </div>
  );
}
