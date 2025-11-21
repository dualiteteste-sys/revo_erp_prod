import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { OrdemServicoDetails, saveOs, deleteOsItem, getOsDetails, OsItemSearchResult, addOsItem } from '@/services/os';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '../ui/forms/Section';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import { Database } from '@/types/database.types';
import OsFormItems from './OsFormItems';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '../common/ClientAutocomplete';

interface OsFormPanelProps {
  os: OrdemServicoDetails | null;
  onSaveSuccess: (savedOs: OrdemServicoDetails) => void;
  onClose: () => void;
}

const statusOptions: { value: Database['public']['Enums']['status_os']; label: string }[] = [
    { value: 'orcamento', label: 'Orçamento' },
    { value: 'aberta', label: 'Aberta' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' },
];

const OsFormPanel: React.FC<OsFormPanelProps> = ({ os, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [formData, setFormData] = useState<Partial<OrdemServicoDetails>>({});
  const [clientName, setClientName] = useState('');

  const descontoProps = useNumericField(formData.desconto_valor, (value) => handleFormChange('desconto_valor', value));

  useEffect(() => {
    if (os) {
      setFormData(os);
      if (os.cliente_id) {
        getPartnerDetails(os.cliente_id).then(partner => {
          if (partner) setClientName(partner.nome);
        });
      } else {
        setClientName('');
      }
    } else {
      setFormData({ status: 'orcamento', desconto_valor: 0, total_itens: 0, total_geral: 0, itens: [] });
      setClientName('');
    }
  }, [os]);

  const refreshOsData = async (osId: string) => {
    try {
        const updatedOs = await getOsDetails(osId);
        setFormData(updatedOs);
    } catch (error: any) {
        addToast("Erro ao atualizar dados da O.S.", "error");
    }
  };

  const handleFormChange = (field: keyof OrdemServicoDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
        await deleteOsItem(itemId);
        if(formData.id) await refreshOsData(formData.id);
        addToast('Item removido.', 'success');
    } catch (error: any) {
        addToast(error.message, 'error');
    }
  };

  const handleAddItem = async (item: OsItemSearchResult) => {
    setIsAddingItem(true);
    try {
      let osToUpdate = formData;
  
      if (!osToUpdate.id) {
        if (!osToUpdate.descricao) {
          addToast('Adicione uma descrição à O.S. antes de adicionar itens.', 'warning');
          setIsAddingItem(false);
          return;
        }
        osToUpdate = await saveOs(osToUpdate);
        setFormData(osToUpdate); // Update form data with the newly created OS
      }
  
      const osId = osToUpdate.id!;
      
      const payload = item.type === 'service'
        ? { servico_id: item.id, qtd: 1 }
        : { produto_id: item.id, quantidade: 1 };

      await addOsItem(osId, payload);
  
      const updatedOs = await getOsDetails(osId);
      setFormData(updatedOs);
  
      addToast(`${item.type === 'service' ? 'Serviço' : 'Produto'} adicionado.`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Falha ao adicionar item à Ordem de Serviço.', 'error');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      addToast('A descrição da O.S. é obrigatória.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedOs = await saveOs(formData);
      addToast('Ordem de Serviço salva com sucesso!', 'success');
      onSaveSuccess(savedOs);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados Gerais" description="Informações principais da Ordem de Serviço">
          <Input
            label="Número"
            name="numero"
            value={formData.numero ?? ''}
            readOnly
            className="sm:col-span-2"
          />
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={clientName}
              onChange={(id, name) => {
                handleFormChange('cliente_id', id);
                if (name) setClientName(name);
              }}
              placeholder="Buscar cliente..."
            />
          </div>
          <Input label="Descrição do Serviço" name="descricao" value={formData.descricao || ''} onChange={e => handleFormChange('descricao', e.target.value)} required className="sm:col-span-4" />
          <Select label="Status" name="status" value={formData.status || 'orcamento'} onChange={e => handleFormChange('status', e.target.value)} className="sm:col-span-2">
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
        </Section>

        <Section title="Datas e Prazos" description="Agendamento e execução do serviço">
          <Input label="Data de Início" name="data_inicio" type="date" value={formData.data_inicio?.split('T')[0] || ''} onChange={e => handleFormChange('data_inicio', e.target.value)} className="sm:col-span-2" />
          <Input label="Data Prevista" name="data_prevista" type="date" value={formData.data_prevista?.split('T')[0] || ''} onChange={e => handleFormChange('data_prevista', e.target.value)} className="sm:col-span-2" />
          <Input label="Hora" name="hora" type="time" value={formData.hora || ''} onChange={e => handleFormChange('hora', e.target.value)} className="sm:col-span-2" />
        </Section>
        
        <OsFormItems items={formData.itens || []} onRemoveItem={handleRemoveItem} onAddItem={handleAddItem} isAddingItem={isAddingItem} />

        <Section title="Financeiro" description="Valores e condições de pagamento">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total dos Itens</label>
            <div className="p-3 bg-gray-100 rounded-lg text-right font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_itens || 0)}</div>
          </div>
          <Input label="Desconto (R$)" name="desconto_valor" {...descontoProps} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Geral</label>
            <div className="p-3 bg-blue-100 text-blue-800 rounded-lg text-right font-bold text-lg">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_geral || 0)}</div>
          </div>
          <Input label="Forma de Recebimento" name="forma_recebimento" value={formData.forma_recebimento || ''} onChange={e => handleFormChange('forma_recebimento', e.target.value)} className="sm:col-span-3" />
          <Input label="Condição de Pagamento" name="condicao_pagamento" value={formData.condicao_pagamento || ''} onChange={e => handleFormChange('condicao_pagamento', e.target.value)} className="sm:col-span-3" />
        </Section>

        <Section title="Observações" description="Detalhes adicionais e anotações internas">
            <TextArea label="Observações" name="observacoes" value={formData.observacoes || ''} onChange={e => handleFormChange('observacoes', e.target.value)} rows={3} className="sm:col-span-3" />
            <TextArea label="Observações Internas" name="observacoes_internas" value={formData.observacoes_internas || ''} onChange={e => handleFormChange('observacoes_internas', e.target.value)} rows={3} className="sm:col-span-3" />
        </Section>

      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar O.S.
          </button>
        </div>
      </footer>
    </div>
  );
};

export default OsFormPanel;
