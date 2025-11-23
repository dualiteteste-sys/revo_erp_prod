import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { RoteiroDetails, RoteiroPayload, saveRoteiro, getRoteiroDetails } from '@/services/industriaRoteiros';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import RoteiroEtapasGrid from './RoteiroEtapasGrid';

interface Props {
  roteiroId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function RoteiroFormPanel({ roteiroId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!roteiroId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'etapas'>('dados');
  
  const [formData, setFormData] = useState<Partial<RoteiroDetails>>({
    tipo_bom: 'producao',
    versao: 1,
    ativo: true,
    padrao_para_producao: true,
    padrao_para_beneficiamento: false,
    etapas: []
  });

  useEffect(() => {
    if (roteiroId) {
      loadDetails();
    }
  }, [roteiroId]);

  const loadDetails = async () => {
    try {
      const data = await getRoteiroDetails(roteiroId!);
      setFormData(data);
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar roteiro.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof RoteiroPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelect = (item: any) => {
    handleHeaderChange('produto_id', item.id);
    handleHeaderChange('produto_nome', item.descricao);
  };

  const handleSaveHeader = async () => {
    if (!formData.produto_id) {
      addToast('Selecione um produto.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: RoteiroPayload = {
        id: formData.id,
        produto_id: formData.produto_id,
        tipo_bom: formData.tipo_bom,
        codigo: formData.codigo,
        descricao: formData.descricao,
        versao: formData.versao,
        ativo: formData.ativo,
        padrao_para_producao: formData.padrao_para_producao,
        padrao_para_beneficiamento: formData.padrao_para_beneficiamento,
        observacoes: formData.observacoes
      };

      const saved = await saveRoteiro(payload);
      setFormData(prev => ({ ...prev, ...saved }));
      
      if (!formData.id) {
        addToast('Roteiro criado! Adicione as etapas.', 'success');
        setActiveTab('etapas');
      } else {
        addToast('Roteiro salvo.', 'success');
      }
      return saved.id;
    } catch (e: any) {
      addToast(e.message, 'error');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

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
            onClick={() => setActiveTab('etapas')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'etapas' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            disabled={!formData.id}
          >
            Etapas ({formData.etapas?.length || 0})
          </button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'dados' && (
            <Section title="Identificação" description="Produto e configurações do roteiro.">
                <div className="sm:col-span-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
                    {formData.id ? (
                        <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                            {formData.produto_nome}
                        </div>
                    ) : (
                        <ItemAutocomplete onSelect={handleProductSelect} />
                    )}
                </div>
                <div className="sm:col-span-2">
                    <Select label="Tipo" name="tipo_bom" value={formData.tipo_bom} onChange={e => handleHeaderChange('tipo_bom', e.target.value)} disabled={!!formData.id}>
                        <option value="producao">Produção</option>
                        <option value="beneficiamento">Beneficiamento</option>
                    </Select>
                </div>
                <Input 
                    label="Código" 
                    name="codigo" 
                    value={formData.codigo || ''} 
                    onChange={e => handleHeaderChange('codigo', e.target.value)} 
                    className="sm:col-span-2"
                />
                <Input 
                    label="Versão" 
                    name="versao" 
                    type="number" 
                    value={formData.versao || 1} 
                    onChange={e => handleHeaderChange('versao', parseInt(e.target.value))} 
                    className="sm:col-span-1"
                />
                <Input 
                    label="Descrição" 
                    name="descricao" 
                    value={formData.descricao || ''} 
                    onChange={e => handleHeaderChange('descricao', e.target.value)} 
                    className="sm:col-span-3"
                />
                
                <div className="sm:col-span-6 flex flex-wrap gap-6 mt-4">
                    <Toggle 
                        label="Ativo" 
                        name="ativo" 
                        checked={formData.ativo !== false} 
                        onChange={checked => handleHeaderChange('ativo', checked)} 
                    />
                    {formData.tipo_bom === 'producao' && (
                        <Toggle 
                            label="Padrão para Produção" 
                            name="padrao_prod" 
                            checked={formData.padrao_para_producao || false} 
                            onChange={checked => handleHeaderChange('padrao_para_producao', checked)} 
                        />
                    )}
                    {formData.tipo_bom === 'beneficiamento' && (
                        <Toggle 
                            label="Padrão para Beneficiamento" 
                            name="padrao_benef" 
                            checked={formData.padrao_para_beneficiamento || false} 
                            onChange={checked => handleHeaderChange('padrao_para_beneficiamento', checked)} 
                        />
                    )}
                </div>
                
                <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} className="sm:col-span-6" />
            </Section>
        )}

        {activeTab === 'etapas' && formData.id && (
            <RoteiroEtapasGrid 
                roteiroId={formData.id} 
                etapas={formData.etapas || []} 
                onUpdate={loadDetails} 
            />
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
            <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
            </button>
            <button 
              onClick={handleSaveHeader} 
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Salvar
            </button>
        </div>
      </footer>
    </div>
  );
}
