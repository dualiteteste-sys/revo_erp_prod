import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ContaCorrente, ContaCorrentePayload, saveContaCorrente } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import { Button } from '@/components/ui/button';

interface Props {
  conta: ContaCorrente | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function ContaCorrenteFormPanel({ conta, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ContaCorrentePayload>({
    tipo_conta: 'corrente',
    moeda: 'BRL',
    ativo: true,
    permite_saldo_negativo: false,
    saldo_inicial: 0,
    limite_credito: 0,
  });

  const saldoInicialProps = useNumericField(formData.saldo_inicial, (v) => handleChange('saldo_inicial', v));
  const limiteCreditoProps = useNumericField(formData.limite_credito, (v) => handleChange('limite_credito', v));

  useEffect(() => {
    if (conta) {
      setFormData(conta);
    }
  }, [conta]);

  const handleChange = (field: keyof ContaCorrentePayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome da conta é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveContaCorrente(formData);
      addToast('Conta salva com sucesso!', 'success');
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
        <Section title="Identificação" description="Dados básicos da conta.">
          <Input 
            label="Nome da Conta" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
            placeholder="Ex: Banco do Brasil - Principal"
          />
          <Select 
            label="Tipo" 
            name="tipo" 
            value={formData.tipo_conta || 'corrente'} 
            onChange={e => handleChange('tipo_conta', e.target.value)}
            className="sm:col-span-2"
          >
            <option value="corrente">Conta Corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="caixa">Caixa Físico</option>
            <option value="carteira">Carteira Digital</option>
            <option value="outro">Outro</option>
          </Select>
          
          {formData.tipo_conta !== 'caixa' && (
            <>
                <Input label="Banco" name="banco" value={formData.banco_nome || ''} onChange={e => handleChange('banco_nome', e.target.value)} className="sm:col-span-2" />
                <Input label="Agência" name="agencia" value={formData.agencia || ''} onChange={e => handleChange('agencia', e.target.value)} className="sm:col-span-2" />
                <div className="sm:col-span-2 flex gap-2">
                    <Input label="Conta" name="conta" value={formData.conta || ''} onChange={e => handleChange('conta', e.target.value)} className="flex-grow" />
                    <Input label="Dígito" name="digito" value={formData.digito || ''} onChange={e => handleChange('digito', e.target.value)} className="w-20" />
                </div>
            </>
          )}
        </Section>

        <Section title="Financeiro" description="Saldos e limites.">
            <Input 
                label="Saldo Inicial" 
                name="saldo_ini" 
                startAdornment="R$"
                inputMode="numeric"
                {...saldoInicialProps}
                className="sm:col-span-2" 
            />
            <Input 
                label="Data Saldo Inicial" 
                name="data_saldo" 
                type="date"
                value={formData.data_saldo_inicial || ''} 
                onChange={e => handleChange('data_saldo_inicial', e.target.value)} 
                className="sm:col-span-2" 
            />
            <Input 
                label="Limite de Crédito" 
                name="limite" 
                startAdornment="R$"
                inputMode="numeric"
                {...limiteCreditoProps}
                className="sm:col-span-2" 
            />
            
            <div className="sm:col-span-6 flex flex-wrap gap-6 mt-4">
                <Toggle 
                    label="Ativo" 
                    name="ativo" 
                    checked={formData.ativo !== false} 
                    onChange={checked => handleChange('ativo', checked)} 
                />
                <Toggle 
                    label="Permite Saldo Negativo" 
                    name="negativo" 
                    checked={formData.permite_saldo_negativo || false} 
                    onChange={checked => handleChange('permite_saldo_negativo', checked)} 
                />
                <Toggle 
                    label="Padrão Pagamentos" 
                    name="padrao_pag" 
                    checked={formData.padrao_para_pagamentos || false} 
                    onChange={checked => handleChange('padrao_para_pagamentos', checked)} 
                />
                <Toggle 
                    label="Padrão Recebimentos" 
                    name="padrao_rec" 
                    checked={formData.padrao_para_recebimentos || false} 
                    onChange={checked => handleChange('padrao_para_recebimentos', checked)} 
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

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Salvar
          </Button>
        </div>
      </footer>
    </div>
  );
}
