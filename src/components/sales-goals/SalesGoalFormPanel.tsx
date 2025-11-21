import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { SalesGoal, SalesGoalPayload, saveSalesGoal } from '@/services/salesGoals';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import DatePicker from '@/components/ui/DatePicker';

interface SalesGoalFormPanelProps {
  goal: Partial<SalesGoal> | null;
  onSaveSuccess: (savedGoal: SalesGoal) => void;
  onClose: () => void;
}

const SalesGoalFormPanel: React.FC<SalesGoalFormPanelProps> = ({ goal, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<SalesGoalPayload>>({});
  const [vendedorName, setVendedorName] = useState('');

  const valorMetaProps = useNumericField(formData.valor_meta, (value) => handleFormChange('valor_meta', value));

  useEffect(() => {
    if (goal) {
      setFormData(goal);
      if (goal.vendedor_id) {
        getPartnerDetails(goal.vendedor_id).then(partner => {
          if (partner) setVendedorName(partner.nome);
        });
      } else {
        setVendedorName('');
      }
    } else {
      setFormData({ valor_meta: 0 });
      setVendedorName('');
    }
  }, [goal]);

  const handleFormChange = (field: keyof SalesGoalPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.vendedor_id || !formData.data_inicio || !formData.data_fim || !formData.valor_meta) {
      addToast('Vendedor, Período e Valor da Meta são obrigatórios.', 'error');
      return;
    }
    if (new Date(formData.data_inicio) > new Date(formData.data_fim)) {
        addToast('A data de início não pode ser posterior à data de fim.', 'error');
        return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        data_inicio: formData.data_inicio ? new Date(formData.data_inicio).toISOString() : undefined,
        data_fim: formData.data_fim ? new Date(formData.data_fim).toISOString() : undefined,
      };
      const savedGoal = await saveSalesGoal(payload);
      addToast('Meta salva com sucesso!', 'success');
      onSaveSuccess(savedGoal);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados da Meta" description="Defina a meta de vendas para um vendedor em um período específico.">
          <div className="sm:col-span-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor</label>
            <ClientAutocomplete
              value={formData.vendedor_id || null}
              initialName={vendedorName}
              onChange={(id, name) => {
                handleFormChange('vendedor_id', id);
                if (name) setVendedorName(name);
              }}
              placeholder="Buscar vendedor..."
            />
          </div>
          <DatePicker
            label="Data de Início"
            value={formData.data_inicio ? new Date(formData.data_inicio) : null}
            onChange={(date) => handleFormChange('data_inicio', date)}
            className="sm:col-span-3"
          />
          <DatePicker
            label="Data de Fim"
            value={formData.data_fim ? new Date(formData.data_fim) : null}
            onChange={(date) => handleFormChange('data_fim', date)}
            className="sm:col-span-3"
          />
          <div className="sm:col-span-3">
            <Input label="Valor da Meta (R$)" name="valor_meta" {...valorMetaProps} required />
          </div>
        </Section>
      </div>
      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar Meta
          </button>
        </div>
      </footer>
    </div>
  );
};

export default SalesGoalFormPanel;
