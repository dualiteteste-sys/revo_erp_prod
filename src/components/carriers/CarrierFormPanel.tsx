import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Carrier, saveCarrier } from '../../services/carriers';
import { useToast } from '../../contexts/ToastProvider';
import Section from '../ui/forms/Section';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import { cnpjMask } from '../../lib/masks';

interface CarrierFormPanelProps {
  carrier: Partial<Carrier> | null;
  onSaveSuccess: (savedCarrier: Carrier) => void;
  onClose: () => void;
}

const CarrierFormPanel: React.FC<CarrierFormPanelProps> = ({ carrier, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Carrier>>({});

  useEffect(() => {
    if (carrier) {
      setFormData(carrier);
    } else {
      setFormData({ status: 'ativa' });
    }
  }, [carrier]);

  const handleFormChange = (field: keyof Carrier, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const maskedValue = cnpjMask(e.target.value);
    handleFormChange('cnpj', maskedValue);
  };

  const handleSave = async () => {
    if (!formData.nome_razao_social) {
      addToast('O Nome/Razão Social é obrigatório.', 'error');
      return;
    }
    
    const payload = {
        ...formData,
        cnpj: formData.cnpj?.replace(/\D/g, '') || null,
    };

    setIsSaving(true);
    try {
      const savedCarrier = await saveCarrier(payload);
      addToast('Transportadora salva com sucesso!', 'success');
      onSaveSuccess(savedCarrier);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados da Transportadora" description="Informações de identificação da transportadora.">
          <Input label="Nome / Razão Social" name="nome_razao_social" value={formData.nome_razao_social || ''} onChange={(e) => handleFormChange('nome_razao_social', e.target.value)} required className="sm:col-span-6" />
          <Input label="Nome Fantasia" name="nome_fantasia" value={formData.nome_fantasia || ''} onChange={(e) => handleFormChange('nome_fantasia', e.target.value)} className="sm:col-span-6" />
          <Input label="CNPJ" name="cnpj" value={formData.cnpj || ''} onChange={handleCnpjChange} className="sm:col-span-3" />
          <Input label="Inscrição Estadual" name="inscr_estadual" value={formData.inscr_estadual || ''} onChange={(e) => handleFormChange('inscr_estadual', e.target.value)} className="sm:col-span-3" />
          <Select label="Status" name="status" value={formData.status || 'ativa'} onChange={(e) => handleFormChange('status', e.target.value)} required className="sm:col-span-3">
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
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

export default CarrierFormPanel;
