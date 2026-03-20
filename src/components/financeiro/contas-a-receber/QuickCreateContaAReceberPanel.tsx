import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { saveContaAReceber, type ContaAReceberPayload } from '@/services/contasAReceber';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';

type QuickCreateContaAReceberPanelProps = {
  initialValues?: {
    descricao?: string;
    valor?: number;
    data_vencimento?: string;
    documento_ref?: string;
    origem_tipo?: string;
    origem_id?: string;
  };
  onSaveSuccess: () => void;
  onClose: () => void;
};

export default function QuickCreateContaAReceberPanel({
  initialValues,
  onSaveSuccess,
  onClose,
}: QuickCreateContaAReceberPanelProps) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ContaAReceberPayload>>({
    status: 'pendente',
    descricao: initialValues?.descricao ?? '',
    valor: initialValues?.valor ?? 0,
    data_vencimento: initialValues?.data_vencimento ?? '',
    origem_tipo: initialValues?.origem_tipo ?? undefined,
    origem_id: initialValues?.origem_id ?? undefined,
  });
  const [clienteName, setClienteName] = useState('');

  const valorProps = useNumericField(formData.valor, (value) =>
    setFormData((prev) => ({ ...prev, valor: value ?? undefined })),
  );

  const handleFormChange = (field: keyof ContaAReceberPayload, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      addToast('Descrição é obrigatória.', 'error');
      return;
    }
    if (!formData.data_vencimento) {
      addToast('Data de Vencimento é obrigatória.', 'error');
      return;
    }
    if (!formData.valor || formData.valor <= 0) {
      addToast('Valor deve ser maior que zero.', 'error');
      return;
    }
    if (!formData.cliente_id) {
      addToast('Cliente é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveContaAReceber(formData);
      addToast('Conta a receber criada com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao criar conta a receber.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto scrollbar-styled">
        <Section title="Dados da Conta" description="Campos essenciais para lançar a conta a receber.">
          <Input
            label="Descrição"
            name="descricao"
            value={formData.descricao || ''}
            onChange={(e) => handleFormChange('descricao', e.target.value)}
            required
            className="sm:col-span-4"
            placeholder="Ex: Pagamento serviço março"
          />
          <Input
            label="Doc. Referência"
            name="documento_ref"
            value={(formData as any).documento_ref || ''}
            onChange={(e) => handleFormChange('documento_ref' as any, e.target.value)}
            className="sm:col-span-2"
            placeholder="Ex: NF 456"
          />

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

          <Input
            label="Valor"
            name="valor"
            startAdornment="R$"
            inputMode="numeric"
            {...valorProps}
            required
            className="sm:col-span-3"
          />

          <Input
            label="Data de Vencimento"
            name="data_vencimento"
            type="date"
            value={formData.data_vencimento?.split('T')[0] || ''}
            onChange={(e) => handleFormChange('data_vencimento', e.target.value)}
            required
            className="sm:col-span-3"
          />

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
            <CentroDeCustoDropdown
              valueId={(formData as any).centro_de_custo_id || null}
              valueName={null}
              onChange={(id, name) => {
                handleFormChange('centro_de_custo_id' as any, id);
                if (name) handleFormChange('centro_custo' as any, name);
              }}
              placeholder="Selecionar…"
              allowedTipos={['receita']}
            />
          </div>

          <TextArea
            label="Observações"
            name="observacoes"
            value={formData.observacoes || ''}
            onChange={(e) => handleFormChange('observacoes', e.target.value)}
            rows={3}
            className="sm:col-span-6"
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Pular
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar Conta
          </button>
        </div>
      </footer>
    </div>
  );
}
