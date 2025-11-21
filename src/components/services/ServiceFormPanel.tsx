import React, { useState, useEffect } from 'react';
import { Loader2, Save, Search } from 'lucide-react';
import { Service, createService, updateService } from '@/services/services';
import { useToast } from '@/contexts/ToastProvider';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';

interface ServiceFormPanelProps {
  service: Partial<Service> | null;
  onSaveSuccess: (savedService: Service) => void;
  onClose: () => void;
}

const ServiceFormPanel: React.FC<ServiceFormPanelProps> = ({ service, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Service>>({});

  const precoVendaProps = useNumericField(
    typeof formData.preco_venda === 'number' ? formData.preco_venda : undefined,
    (value) => handleFormChange('preco_venda', value)
  );

  useEffect(() => {
    if (service) {
      setFormData(service);
    } else {
      setFormData({ status: 'ativo', nbs_ibpt_required: false });
    }
  }, [service]);

  const handleFormChange = (field: keyof Service, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      addToast('A descrição é obrigatória.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let savedService: Service;
      if (formData.id) {
        savedService = await updateService(formData.id, formData);
        addToast('Serviço atualizado com sucesso!', 'success');
      } else {
        savedService = await createService(formData);
        addToast('Serviço criado com sucesso!', 'success');
      }
      onSaveSuccess(savedService);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          
          <div className="md:col-span-2">
            <Input
              label="Descrição"
              name="descricao"
              value={formData.descricao || ''}
              onChange={e => handleFormChange('descricao', e.target.value)}
              placeholder="Descrição completa do serviço"
              required
            />
          </div>

          <div>
            <Input
              label="Código"
              name="codigo"
              value={formData.codigo || ''}
              onChange={e => handleFormChange('codigo', e.target.value)}
              placeholder="Código ou referência (opcional)"
            />
          </div>

          <div>
            <Select
              label="Situação"
              name="status"
              value={formData.status || 'ativo'}
              onChange={e => handleFormChange('status', e.target.value)}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Estado atual</p>
          </div>
          
          <div>
            <Input
              label="Preço"
              name="preco_venda"
              {...precoVendaProps}
              placeholder="Preço de venda"
              endAdornment="R$"
            />
          </div>

          <div>
            <Input
              label="Unidade"
              name="unidade"
              value={formData.unidade || ''}
              onChange={e => handleFormChange('unidade', e.target.value)}
              placeholder="(Ex: Pç, Kg,...)"
            />
          </div>

          <div>
            <label htmlFor="codigo_servico" className="block text-sm font-medium text-gray-700 mb-1">Código do serviço conforme tabela de serviços</label>
            <div className="relative">
              <input
                id="codigo_servico"
                name="codigo_servico"
                value={formData.codigo_servico || ''}
                onChange={e => handleFormChange('codigo_servico', e.target.value)}
                className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm pr-12"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500 hover:text-blue-600"
              >
                <Search size={20} />
              </button>
            </div>
          </div>
          
          <div>
            <label htmlFor="nbs" className="block text-sm font-medium text-gray-700 mb-1">Nomenclatura brasileira de serviço (NBS)</label>
            <div className="relative">
              <input
                id="nbs"
                name="nbs"
                value={formData.nbs || ''}
                onChange={e => handleFormChange('nbs', e.target.value)}
                className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm pr-12"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500 hover:text-blue-600"
              >
                <Search size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Necessária para o IBPT</p>
          </div>

          <div className="md:col-span-2 pt-4 mt-4 border-t border-gray-200">
            <TextArea
              label="Descrição Complementar"
              name="descricao_complementar"
              value={formData.descricao_complementar || ''}
              onChange={e => handleFormChange('descricao_complementar', e.target.value)}
              rows={5}
            />
            <p className="text-xs text-gray-500 mt-1">Campo exibido em propostas comerciais e pedidos de venda. Editar HTML.</p>
          </div>

          <div className="md:col-span-2 pt-4 mt-4 border-t border-gray-200">
            <TextArea
              label="Observações"
              name="observacoes"
              value={formData.observacoes || ''}
              onChange={e => handleFormChange('observacoes', e.target.value)}
              placeholder="Observações gerais sobre o serviço."
              rows={3}
            />
          </div>
        </div>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ServiceFormPanel;
