import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Movimentacao, MovimentacaoPayload, saveMovimentacao } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import { Button } from '@/components/ui/button';

interface Props {
  movimentacao: Movimentacao | null;
  contaCorrenteId: string;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function MovimentacaoFormPanel({ movimentacao, contaCorrenteId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<MovimentacaoPayload>({
    conta_corrente_id: contaCorrenteId,
    tipo_mov: 'saida',
    data_movimento: new Date().toISOString().split('T')[0],
    origem_tipo: 'manual',
    valor: 0,
  });

  const valorProps = useNumericField(formData.valor, (v) => handleChange('valor', v));

  useEffect(() => {
    if (movimentacao) {
      setFormData(movimentacao);
    }
  }, [movimentacao]);

  const handleChange = (field: keyof MovimentacaoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.valor || formData.valor <= 0) {
      addToast('O valor deve ser maior que zero.', 'error');
      return;
    }
    if (!formData.descricao) {
      addToast('A descrição é obrigatória.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveMovimentacao(formData);
      addToast('Movimentação salva com sucesso!', 'success');
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
        <Section title="Dados da Movimentação" description="Registre uma entrada ou saída manual.">
          <div className="sm:col-span-2">
            <Select 
                label="Tipo" 
                name="tipo" 
                value={formData.tipo_mov} 
                onChange={e => handleChange('tipo_mov', e.target.value)}
            >
                <option value="entrada">Entrada (Crédito)</option>
                <option value="saida">Saída (Débito)</option>
            </Select>
          </div>
          
          <Input 
            label="Valor (R$)" 
            name="valor" 
            {...valorProps}
            className="sm:col-span-2" 
          />

          <Input 
            label="Data" 
            name="data" 
            type="date"
            value={formData.data_movimento || ''} 
            onChange={e => handleChange('data_movimento', e.target.value)} 
            className="sm:col-span-2" 
          />

          <Input 
            label="Descrição" 
            name="desc" 
            value={formData.descricao || ''} 
            onChange={e => handleChange('descricao', e.target.value)} 
            required 
            className="sm:col-span-6" 
          />

          <Input 
            label="Categoria" 
            name="cat" 
            value={formData.categoria || ''} 
            onChange={e => handleChange('categoria', e.target.value)} 
            className="sm:col-span-3" 
            placeholder="Ex: Tarifas, Ajustes, Suprimentos"
          />

          <Input 
            label="Centro de Custo" 
            name="cc" 
            value={formData.centro_custo || ''} 
            onChange={e => handleChange('centro_custo', e.target.value)} 
            className="sm:col-span-3" 
          />

          <Input 
            label="Documento Ref." 
            name="doc" 
            value={formData.documento_ref || ''} 
            onChange={e => handleChange('documento_ref', e.target.value)} 
            className="sm:col-span-2" 
          />

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
