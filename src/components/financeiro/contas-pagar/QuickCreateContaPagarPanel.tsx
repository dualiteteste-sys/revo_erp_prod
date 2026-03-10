import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { saveContaPagar, type ContaPagarPayload } from '@/services/financeiro';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';

type QuickCreateContaPagarPanelProps = {
  /** Fixed payment method — shown as disabled input */
  formaPagamento: string;
  onSaveSuccess: () => void;
  onClose: () => void;
};

export default function QuickCreateContaPagarPanel({
  formaPagamento,
  onSaveSuccess,
  onClose,
}: QuickCreateContaPagarPanelProps) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ContaPagarPayload>>({
    status: 'aberta',
    valor_total: 0,
    valor_pago: 0,
    forma_pagamento: formaPagamento,
  });
  const [fornecedorName, setFornecedorName] = useState('');

  const valorTotalProps = useNumericField(formData.valor_total, (value) =>
    setFormData((prev) => ({ ...prev, valor_total: value ?? undefined })),
  );

  const handleFormChange = (field: keyof ContaPagarPayload, value: any) => {
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
    if (!formData.valor_total || formData.valor_total <= 0) {
      addToast('Valor Total deve ser maior que zero.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveContaPagar({ ...formData, forma_pagamento: formaPagamento });
      addToast('Conta a pagar criada com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao criar conta a pagar.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow overflow-y-auto scrollbar-styled">
        <Section title="Dados da Conta" description="Campos essenciais para lançar a conta a pagar.">
          <Input
            label="Descrição"
            name="descricao"
            value={formData.descricao || ''}
            onChange={(e) => handleFormChange('descricao', e.target.value)}
            required
            className="sm:col-span-4"
            placeholder="Ex: Fatura cartão março"
          />
          <Input
            label="Doc. Referência"
            name="documento_ref"
            value={formData.documento_ref || ''}
            onChange={(e) => handleFormChange('documento_ref', e.target.value)}
            className="sm:col-span-2"
            placeholder="Ex: NF 123"
          />

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
            <ClientAutocomplete
              value={formData.fornecedor_id || null}
              initialName={fornecedorName}
              entity="supplier"
              onChange={(id, name) => {
                handleFormChange('fornecedor_id', id);
                if (name) setFornecedorName(name);
              }}
              placeholder="Buscar fornecedor..."
            />
          </div>

          <Input
            label="Forma de Pagamento"
            name="forma_pagamento"
            value={formaPagamento}
            disabled
            className="sm:col-span-3"
          />

          <Input
            label="Valor Total"
            name="valor_total"
            startAdornment="R$"
            inputMode="numeric"
            {...valorTotalProps}
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

          <Input
            label="Categoria"
            name="categoria"
            value={formData.categoria || ''}
            onChange={(e) => handleFormChange('categoria', e.target.value)}
            className="sm:col-span-3"
          />

          <Input
            label="Data de Emissão"
            name="data_emissao"
            type="date"
            value={formData.data_emissao?.split('T')[0] || ''}
            onChange={(e) => handleFormChange('data_emissao', e.target.value)}
            className="sm:col-span-3"
          />

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
            Cancelar
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
