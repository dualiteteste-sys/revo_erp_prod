import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { MaterialClienteDetails, MaterialClientePayload, saveMaterialCliente, getMaterialClienteDetails } from '@/services/industriaMateriais';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { OsItemSearchResult } from '@/services/os';

interface Props {
  materialId: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function MaterialFormPanel({ materialId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!materialId);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState<Partial<MaterialClienteDetails>>({
    ativo: true,
    unidade: 'un'
  });

  useEffect(() => {
    if (materialId) {
      loadDetails();
    }
  }, [materialId]);

  const loadDetails = async () => {
    try {
      const data = await getMaterialClienteDetails(materialId!);
      setFormData(data);
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar material.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof MaterialClientePayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelect = (item: OsItemSearchResult) => {
    if (item.type !== 'product') {
        addToast('Selecione apenas produtos para vincular.', 'warning');
        return;
    }
    handleChange('produto_id', item.id);
    handleChange('produto_nome', item.descricao);
  };

  const handleSave = async () => {
    if (!formData.cliente_id) {
      addToast('Selecione um cliente.', 'error');
      return;
    }
    if (!formData.produto_id) {
      addToast('Selecione um produto interno.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: MaterialClientePayload = {
        id: formData.id,
        cliente_id: formData.cliente_id,
        produto_id: formData.produto_id,
        codigo_cliente: formData.codigo_cliente,
        nome_cliente: formData.nome_cliente,
        unidade: formData.unidade,
        ativo: formData.ativo,
        observacoes: formData.observacoes
      };

      await saveMaterialCliente(payload);
      addToast('Material salvo com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Vínculo" description="Associe o material do cliente a um produto interno.">
            <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <ClientAutocomplete
                    value={formData.cliente_id || null}
                    initialName={formData.cliente_nome}
                    onChange={(id, name) => {
                        handleChange('cliente_id', id);
                        if (name) handleChange('cliente_nome', name);
                    }}
                />
            </div>
            <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Produto Interno (Nosso)</label>
                {formData.id ? (
                    <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                        {formData.produto_nome}
                    </div>
                ) : (
                    <ItemAutocomplete onSelect={handleProductSelect} />
                )}
                {formData.produto_nome && !formData.id && <p className="text-xs text-gray-500 mt-1">Selecionado: {formData.produto_nome}</p>}
            </div>
        </Section>

        <Section title="Dados do Cliente" description="Como este material é identificado pelo cliente.">
            <Input 
                label="Código no Cliente" 
                name="cod_cli" 
                value={formData.codigo_cliente || ''} 
                onChange={e => handleChange('codigo_cliente', e.target.value)} 
                className="sm:col-span-2"
                placeholder="Ex: MAT-001"
            />
            <Input 
                label="Nome/Descrição no Cliente" 
                name="nome_cli" 
                value={formData.nome_cliente || ''} 
                onChange={e => handleChange('nome_cliente', e.target.value)} 
                className="sm:col-span-4"
                placeholder="Descrição conforme nota fiscal do cliente"
            />
            <Input 
                label="Unidade" 
                name="unidade" 
                value={formData.unidade || ''} 
                onChange={e => handleChange('unidade', e.target.value)} 
                className="sm:col-span-2"
            />
            <div className="sm:col-span-4 flex items-center pt-6">
                <Toggle 
                    label="Ativo" 
                    name="ativo" 
                    checked={formData.ativo !== false} 
                    onChange={checked => handleChange('ativo', checked)} 
                />
            </div>
            <TextArea 
                label="Observações" 
                name="obs" 
                value={formData.observacoes || ''} 
                onChange={e => handleChange('observacoes', e.target.value)} 
                rows={3} 
                className="sm:col-span-6" 
            />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
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
