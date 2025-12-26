import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ContaPagar, saveContaPagar, ContaPagarPayload } from '@/services/financeiro';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';

interface ContasPagarFormPanelProps {
  conta: Partial<ContaPagar> | null;
  onSaveSuccess: (savedConta: ContaPagar) => void;
  onClose: () => void;
}

const statusOptions = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'cancelada', label: 'Cancelada' },
];

const ContasPagarFormPanel: React.FC<ContasPagarFormPanelProps> = ({ conta, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ContaPagarPayload>>({});
  const [fornecedorName, setFornecedorName] = useState('');
  const isPagoOuParcial = formData.status === 'paga' || formData.status === 'parcial';

  const valorTotalProps = useNumericField(formData.valor_total, (value) => handleFormChange('valor_total', value));
  const valorPagoProps = useNumericField(formData.valor_pago, (value) => handleFormChange('valor_pago', value));
  const multaProps = useNumericField(formData.multa, (value) => handleFormChange('multa', value));
  const jurosProps = useNumericField(formData.juros, (value) => handleFormChange('juros', value));
  const descontoProps = useNumericField(formData.desconto, (value) => handleFormChange('desconto', value));

  useEffect(() => {
    if (conta) {
      setFormData({
        ...conta,
        // Garante que campos numéricos não sejam undefined
        valor_total: conta.valor_total || 0,
        valor_pago: conta.valor_pago || 0,
        multa: conta.multa || 0,
        juros: conta.juros || 0,
        desconto: conta.desconto || 0,
      });
      if (conta.fornecedor_id) {
        getPartnerDetails(conta.fornecedor_id).then(partner => {
          if (partner) setFornecedorName(partner.nome);
        });
      } else {
        setFornecedorName('');
      }
    } else {
      setFormData({ 
        status: 'aberta', 
        valor_total: 0, 
        valor_pago: 0,
        multa: 0,
        juros: 0,
        desconto: 0 
      });
      setFornecedorName('');
    }
  }, [conta]);

  const handleFormChange = (field: keyof ContaPagarPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.descricao || !formData.data_vencimento || !formData.valor_total) {
      addToast('Descrição, Data de Vencimento e Valor Total são obrigatórios.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedConta = await saveContaPagar(formData);
      addToast('Conta a pagar salva com sucesso!', 'success');
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
        <Section title="Dados da Conta" description="Informações principais da conta a pagar.">
          <Input label="Descrição" name="descricao" value={formData.descricao || ''} onChange={e => handleFormChange('descricao', e.target.value)} required className="sm:col-span-4" />
          <Input label="Doc. Referência" name="documento_ref" value={formData.documento_ref || ''} onChange={e => handleFormChange('documento_ref', e.target.value)} className="sm:col-span-2" placeholder="Ex: NF 123" />
          
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
            <ClientAutocomplete
              value={formData.fornecedor_id || null}
              initialName={fornecedorName}
              onChange={(id, name) => {
                handleFormChange('fornecedor_id', id);
                if (name) setFornecedorName(name);
              }}
              placeholder="Buscar fornecedor..."
            />
          </div>
          
          <Input label="Valor Total (R$)" name="valor_total" {...valorTotalProps} required className="sm:col-span-3" />
          
          <Input label="Data de Emissão" name="data_emissao" type="date" value={formData.data_emissao?.split('T')[0] || ''} onChange={e => handleFormChange('data_emissao', e.target.value)} className="sm:col-span-2" />
          <Input label="Data de Vencimento" name="data_vencimento" type="date" value={formData.data_vencimento?.split('T')[0] || ''} onChange={e => handleFormChange('data_vencimento', e.target.value)} required className="sm:col-span-2" />
          
          <Select
            label="Status"
            name="status"
            value={formData.status || 'aberta'}
            onChange={e => handleFormChange('status', e.target.value as any)}
            className="sm:col-span-2"
            disabled={isPagoOuParcial}
          >
            {formData.status === 'paga' ? <option value="paga">Paga (registrado)</option> : null}
            {formData.status === 'parcial' ? <option value="parcial">Parcial (registrado)</option> : null}
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
        </Section>

        <Section title="Detalhes do Pagamento" description="Informações sobre o pagamento, juros e descontos.">
          <div className="sm:col-span-6 text-sm text-gray-600">
            Para registrar pagamento (e manter a Tesouraria/caixa consistente), use a ação <span className="font-medium">Registrar pagamento</span> na listagem.
          </div>
          <Input label="Data de Pagamento" name="data_pagamento" type="date" value={formData.data_pagamento?.split('T')[0] || ''} disabled className="sm:col-span-2" />
          <Input label="Valor Pago (R$)" name="valor_pago" {...valorPagoProps} disabled className="sm:col-span-2" />
          <div className="sm:col-span-2"></div>

          <Input label="Multa (R$)" name="multa" {...multaProps} className="sm:col-span-2" />
          <Input label="Juros (R$)" name="juros" {...jurosProps} className="sm:col-span-2" />
          <Input label="Desconto (R$)" name="desconto" {...descontoProps} className="sm:col-span-2" />

          <Input label="Forma de Pagamento" name="forma_pagamento" value={formData.forma_pagamento || ''} onChange={e => handleFormChange('forma_pagamento', e.target.value)} className="sm:col-span-3" placeholder="Ex: Boleto, Pix" />
          <Input label="Categoria" name="categoria" value={formData.categoria || ''} onChange={e => handleFormChange('categoria', e.target.value)} className="sm:col-span-3" />

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

export default ContasPagarFormPanel;
