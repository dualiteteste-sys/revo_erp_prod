import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CompetenciaPayload, saveCompetencia, Competencia } from '@/services/rh';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';

interface CompetenciaFormPanelProps {
  competencia: Competencia | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const CompetenciaFormPanel: React.FC<CompetenciaFormPanelProps> = ({ competencia, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CompetenciaPayload>({});

  useEffect(() => {
    if (competencia) {
      setFormData(competencia);
    } else {
      setFormData({ ativo: true, tipo: 'tecnica', critico_sgq: false });
    }
  }, [competencia]);

  const handleFormChange = (field: keyof CompetenciaPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome da competência é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveCompetencia(formData);
      addToast('Competência salva com sucesso!', 'success');
      onSaveSuccess();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados da Competência" description="Defina as habilidades e conhecimentos requeridos.">
          <Input 
            label="Nome" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleFormChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
          />
          <Select 
            label="Tipo" 
            name="tipo" 
            value={formData.tipo || 'tecnica'} 
            onChange={e => handleFormChange('tipo', e.target.value)}
            className="sm:col-span-2"
          >
            <option value="tecnica">Técnica</option>
            <option value="comportamental">Comportamental</option>
            <option value="certificacao">Certificação</option>
            <option value="idioma">Idioma</option>
            <option value="outros">Outros</option>
          </Select>
          
          <div className="sm:col-span-6 flex gap-6">
            <Toggle 
              label="Ativo" 
              name="ativo" 
              checked={formData.ativo !== false} 
              onChange={checked => handleFormChange('ativo', checked)} 
            />
            <Toggle 
              label="Crítico para SGQ" 
              name="critico_sgq" 
              checked={formData.critico_sgq === true} 
              onChange={checked => handleFormChange('critico_sgq', checked)} 
              description="Impacta diretamente na qualidade (ISO 9001)."
            />
          </div>

          <TextArea 
            label="Descrição" 
            name="descricao" 
            value={formData.descricao || ''} 
            onChange={e => handleFormChange('descricao', e.target.value)} 
            rows={4} 
            className="sm:col-span-6" 
            placeholder="Descreva o que é esperado desta competência..."
          />
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

export default CompetenciaFormPanel;
