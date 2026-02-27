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
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';
import CategoriaMovimentacaoDropdown from '@/components/common/CategoriaMovimentacaoDropdown';

interface Props {
  movimentacao: Movimentacao | null;
  contaCorrenteId: string;
  readOnly?: boolean;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function MovimentacaoFormPanel({ movimentacao, contaCorrenteId, readOnly, onSaveSuccess, onClose }: Props) {
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
    if (readOnly) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (readOnly) {
      addToast('Esta movimentação não pode ser editada aqui.', 'info');
      return;
    }
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
        {readOnly ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-semibold">Movimentação em modo leitura</div>
            <div className="mt-1">
              Esta movimentação está conciliada ou foi gerada por outro fluxo. Para corrigir saldo/baixa, faça o estorno/ajuste no módulo de origem.
            </div>
            {(formData.origem_tipo || formData.origem_id) ? (
              <div className="mt-2 text-xs text-amber-900/90">
                <span className="font-medium">Origem:</span>{' '}
                {formData.origem_tipo ?? '—'}
                {formData.origem_id ? ` (${formData.origem_id})` : ''}
              </div>
            ) : null}
          </div>
        ) : null}
        <Section title="Dados da Movimentação" description="Registre uma entrada ou saída manual.">
          <div className="sm:col-span-2">
            <Select 
                label="Tipo" 
                name="tipo" 
                value={formData.tipo_mov} 
                onChange={e => handleChange('tipo_mov', e.target.value)}
                disabled={readOnly}
            >
                <option value="entrada">Entrada (Crédito)</option>
                <option value="saida">Saída (Débito)</option>
            </Select>
          </div>
          
          <Input
            label="Valor"
            name="valor"
            startAdornment="R$"
            inputMode="numeric"
            {...valorProps}
            className="sm:col-span-2"
            disabled={readOnly}
          />

          <Input 
            label="Data" 
            name="data" 
            type="date"
            value={formData.data_movimento || ''} 
            onChange={e => handleChange('data_movimento', e.target.value)} 
            className="sm:col-span-2" 
            disabled={readOnly}
          />

          <Input 
            label="Descrição" 
            name="desc" 
            value={formData.descricao || ''} 
            onChange={e => handleChange('descricao', e.target.value)} 
            required 
            className="sm:col-span-6" 
            disabled={readOnly}
          />

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (opcional)</label>
            <CategoriaMovimentacaoDropdown
              value={formData.categoria ?? null}
              onChange={nome => handleChange('categoria', nome)}
              tipo={formData.tipo_mov === 'entrada' ? 'entrada' : 'saida'}
              disabled={readOnly}
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo (opcional)</label>
            <CentroDeCustoDropdown
              valueId={formData.centro_de_custo_id ?? null}
              valueName={(formData as any).centro_custo ?? null}
              onChange={(id, name) => {
                handleChange('centro_de_custo_id', id);
                handleChange('centro_custo', name ?? null);
              }}
              placeholder="Selecionar…"
              disabled={readOnly}
            />
            <div className="text-[11px] text-gray-500 mt-1">
              Usado em relatórios e auditoria. Se vazio, fica “sem centro”.
            </div>
          </div>

          <Input 
            label="Documento Ref." 
            name="doc" 
            value={formData.documento_ref || ''} 
            onChange={e => handleChange('documento_ref', e.target.value)} 
            className="sm:col-span-2" 
            disabled={readOnly}
          />

          <TextArea 
            label="Observações" 
            name="obs" 
            value={formData.observacoes || ''} 
            onChange={e => handleChange('observacoes', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
            disabled={readOnly}
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly ? (
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Salvar
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
