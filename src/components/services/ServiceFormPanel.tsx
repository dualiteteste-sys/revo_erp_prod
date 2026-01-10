import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Service, createService, updateService } from '@/services/services';
import { useToast } from '@/contexts/ToastProvider';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import { Button } from '@/components/ui/button';
import UnidadeMedidaSelect from '@/components/common/UnidadeMedidaSelect';

interface ServiceFormPanelProps {
  service: Partial<Service> | null;
  onSaveSuccess: (savedService: Service) => void;
  onClose: () => void;
}

type ServiceFormTab = 'geral' | 'fiscal' | 'descricao' | 'obs';

const ServiceFormPanel: React.FC<ServiceFormPanelProps> = ({ service, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Service>>({});
  const [activeTab, setActiveTab] = useState<ServiceFormTab>('geral');

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
    setActiveTab('geral');
  }, [service]);

  const handleFormChange = (field: keyof Service, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      addToast('A descrição é obrigatória.', 'error');
      return;
    }

    const preco = Number(formData.preco_venda ?? 0);
    if (!Number.isFinite(preco) || preco < 0) {
      addToast('Preço de venda inválido.', 'error');
      setActiveTab('geral');
      return;
    }

    const nbs = String(formData.nbs || '').trim();
    if (nbs) {
      const digits = nbs.replace(/\D/g, '');
      if (digits.length !== 9) {
        addToast('NBS inválido. Use 9 dígitos (apenas números).', 'warning');
        setActiveTab('fiscal');
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: Partial<Service> = {
        ...formData,
        descricao: String(formData.descricao).trim(),
        codigo: formData.codigo ? String(formData.codigo).trim() : null,
        unidade: formData.unidade ? String(formData.unidade).trim().toUpperCase() : null,
        nbs: nbs ? nbs.replace(/\D/g, '') : null,
      };
      let savedService: Service;
      if (payload.id) {
        savedService = await updateService(payload.id, payload);
        addToast('Serviço atualizado com sucesso!', 'success');
      } else {
        savedService = await createService(payload);
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
      <div className="flex-shrink-0 px-6 pt-6">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={activeTab === 'geral' ? 'default' : 'secondary'} onClick={() => setActiveTab('geral')}>
            Geral
          </Button>
          <Button type="button" variant={activeTab === 'fiscal' ? 'default' : 'secondary'} onClick={() => setActiveTab('fiscal')}>
            Fiscal / NBS
          </Button>
          <Button type="button" variant={activeTab === 'descricao' ? 'default' : 'secondary'} onClick={() => setActiveTab('descricao')}>
            Descrição
          </Button>
          <Button type="button" variant={activeTab === 'obs' ? 'default' : 'secondary'} onClick={() => setActiveTab('obs')}>
            Observações
          </Button>
        </div>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {activeTab === 'geral' ? (
            <>
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
                  label="Preço de venda"
                  name="preco_venda"
                  {...precoVendaProps}
                  placeholder="0,00"
                  startAdornment="R$"
                  inputMode="numeric"
                />
              </div>

              <div>
                <UnidadeMedidaSelect
                  label="Unidade (opcional)"
                  name="unidade"
                  value={formData.unidade || ''}
                  onChange={(sigla) => handleFormChange('unidade', sigla)}
                  placeholder="Selecione..."
                />
              </div>
            </>
          ) : null}

          {activeTab === 'fiscal' ? (
            <>
              <div>
                <Input
                  label="Código do serviço (tabela municipal)"
                  name="codigo_servico"
                  value={formData.codigo_servico || ''}
                  onChange={e => handleFormChange('codigo_servico', e.target.value)}
                  placeholder="Opcional"
                />
                <p className="text-xs text-gray-500 mt-1">Use quando sua prefeitura exigir código de serviço.</p>
              </div>
          
              <div>
                <Input
                  label="NBS (Nomenclatura Brasileira de Serviços)"
                  name="nbs"
                  value={formData.nbs || ''}
                  onChange={e => handleFormChange('nbs', e.target.value)}
                  placeholder="Opcional"
                />
                <p className="text-xs text-gray-500 mt-1">Quando preenchido, ajuda integrações fiscais/IBPT.</p>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={!!formData.nbs_ibpt_required}
                    onChange={(e) => handleFormChange('nbs_ibpt_required', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Exigir NBS/IBPT para este serviço
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Quando marcado, você garante que o serviço esteja pronto para cálculos/integrações fiscais.
                </p>
              </div>
            </>
          ) : null}

          {activeTab === 'descricao' ? (
            <div className="md:col-span-2">
              <TextArea
                label="Descrição Complementar"
                name="descricao_complementar"
                value={formData.descricao_complementar || ''}
                onChange={e => handleFormChange('descricao_complementar', e.target.value)}
                rows={8}
              />
              <p className="text-xs text-gray-500 mt-1">Campo exibido em propostas comerciais e pedidos de venda.</p>
            </div>
          ) : null}

          {activeTab === 'obs' ? (
            <div className="md:col-span-2">
              <TextArea
                label="Observações"
                name="observacoes"
                value={formData.observacoes || ''}
                onChange={e => handleFormChange('observacoes', e.target.value)}
                placeholder="Observações gerais sobre o serviço."
                rows={6}
              />
            </div>
          ) : null}
        </div>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            <span className="ml-2">Salvar</span>
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default ServiceFormPanel;
