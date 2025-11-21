import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CentroDeCusto, saveCentroDeCusto } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';

interface CentrosDeCustoFormPanelProps {
  centro: Partial<CentroDeCusto> | null;
  onSaveSuccess: (savedCentro: CentroDeCusto) => void;
  onClose: () => void;
}

const CentrosDeCustoFormPanel: React.FC<CentrosDeCustoFormPanelProps> = ({ centro, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<CentroDeCusto>>({});

  useEffect(() => {
    if (centro) {
      setFormData(centro);
    } else {
      setFormData({ status: 'ativo' });
    }
  }, [centro]);

  const handleFormChange = (field: keyof CentroDeCusto, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedCentro = await saveCentroDeCusto(formData);
      addToast('Centro de Custo salvo com sucesso!', 'success');
      onSaveSuccess(savedCentro);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados do Centro de Custo" description="Informações de identificação.">
          <Input label="Nome" name="nome" value={formData.nome || ''} onChange={e => handleFormChange('nome', e.target.value)} required className="sm:col-span-4" />
          <Input label="Código" name="codigo" value={formData.codigo || ''} onChange={e => handleFormChange('codigo', e.target.value)} className="sm:col-span-2" />
          <Select label="Status" name="status" value={formData.status || 'ativo'} onChange={e => handleFormChange('status', e.target.value as any)} className="sm:col-span-3">
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>
        </Section>
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

export default CentrosDeCustoFormPanel;
