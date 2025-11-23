import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CentroTrabalho, CentroTrabalhoPayload, saveCentroTrabalho } from '@/services/industriaCentros';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';

interface Props {
  centro: CentroTrabalho | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function CentroTrabalhoFormPanel({ centro, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CentroTrabalhoPayload>({
    ativo: true,
    tipo_uso: 'ambos'
  });

  useEffect(() => {
    if (centro) {
      setFormData(centro);
    }
  }, [centro]);

  const handleChange = (field: keyof CentroTrabalhoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveCentroTrabalho(formData);
      addToast('Centro de trabalho salvo com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Identificação" description="Dados básicos do centro de trabalho.">
          <Input 
            label="Nome" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
          />
          <Input 
            label="Código" 
            name="codigo" 
            value={formData.codigo || ''} 
            onChange={e => handleChange('codigo', e.target.value)} 
            className="sm:col-span-2" 
          />
          <div className="sm:col-span-6">
            <Toggle 
              label="Ativo" 
              name="ativo" 
              checked={formData.ativo !== false} 
              onChange={checked => handleChange('ativo', checked)} 
            />
          </div>
          <TextArea 
            label="Descrição" 
            name="descricao" 
            value={formData.descricao || ''} 
            onChange={e => handleChange('descricao', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
          />
        </Section>

        <Section title="Capacidade e Uso" description="Definições operacionais.">
          <Select 
            label="Tipo de Uso" 
            name="tipo_uso" 
            value={formData.tipo_uso || 'ambos'} 
            onChange={e => handleChange('tipo_uso', e.target.value)}
            className="sm:col-span-3"
          >
            <option value="producao">Produção</option>
            <option value="beneficiamento">Beneficiamento</option>
            <option value="ambos">Ambos</option>
          </Select>
          
          <Input 
            label="Capacidade (Unidades/Hora)" 
            name="capacidade" 
            type="number"
            value={formData.capacidade_unidade_hora || ''} 
            onChange={e => handleChange('capacidade_unidade_hora', parseFloat(e.target.value))} 
            className="sm:col-span-3" 
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
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
