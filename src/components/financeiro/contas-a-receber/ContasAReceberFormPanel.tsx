import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ContaAReceber, saveContaAReceber } from '@/services/contasAReceber';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';

interface ContasAReceberFormPanelProps {
  conta: Partial<ContaAReceber> | null;
  onSaveSuccess: (savedConta: ContaAReceber) => void;
  onClose: () => void;
}

const statusOptions = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
];

const ContasAReceberFormPanel: React.FC<ContasAReceberFormPanelProps> = ({ conta, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ContaAReceber>>({});
  const [clienteName, setClienteName] = useState('');

  const valorProps = useNumericField(formData.valor, (value) => handleFormChange('valor', value));

  useEffect(() => {
    if (conta) {
      setFormData(conta);
      if (conta.cliente_id) {
        getPartnerDetails(conta.cliente_id).then(partner => {
          if (partner) setClienteName(partner.nome);
        });
      } else {
        setClienteName('');
      }
    } else {
      setFormData({ status: 'pendente', valor: 0 });
      setClienteName('');
    }
  }, [conta]);

  const handleFormChange = (field: keyof ContaAReceber, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.descricao || !formData.data_vencimento || !formData.valor) {
      addToast('Descrição, Data de Vencimento e Valor são obrigatórios.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedConta = await saveContaAReceber(formData);
      addToast('Conta a receber salva com sucesso!', 'success');
      onSaveSuccess(savedConta);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados da Conta" description="Informações principais da conta a receber.">
          <Input label="Descrição" name="descricao" value={formData.descricao || ''} onChange={e => handleFormChange('descricao', e.target.value)} required className="sm:col-span-6" />
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={clienteName}
              onChange={(id, name) => {
                handleFormChange('cliente_id', id);
                if (name) setClienteName(name);
              }}
              placeholder="Buscar cliente..."
            />
          </div>
          <Input label="Valor (R$)" name="valor" {...valorProps} required className="sm:col-span-3" />
          <Input label="Data de Vencimento" name="data_vencimento" type="date" value={formData.data_vencimento?.split('T')[0] || ''} onChange={e => handleFormChange('data_vencimento', e.target.value)} required className="sm:col-span-3" />
          <Select label="Status" name="status" value={formData.status || 'pendente'} onChange={e => handleFormChange('status', e.target.value as any)} className="sm:col-span-3">
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
        </Section>
        <Section title="Detalhes do Recebimento" description="Informações sobre o recebimento da conta.">
          <Input label="Data de Recebimento" name="data_pagamento" type="date" value={formData.data_pagamento?.split('T')[0] || ''} onChange={e => handleFormChange('data_pagamento', e.target.value)} className="sm:col-span-3" />
          <Input label="Valor Recebido" name="valor_pago" type="number" step="0.01" value={formData.valor_pago || ''} onChange={e => handleFormChange('valor_pago', parseFloat(e.target.value))} className="sm:col-span-3" />
          <TextArea label="Observações" name="observacoes" value={formData.observacoes || ''} onChange={e => handleFormChange('observacoes', e.target.value)} rows={3} className="sm:col-span-6" />
        </Section>
      </div>
      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar Conta
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ContasAReceberFormPanel;
