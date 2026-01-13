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
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';
import { Switch } from '@/components/ui/switch';
import { generateRecorrencia, upsertRecorrencia, type FinanceiroRecorrenciaAjusteDiaUtil, type FinanceiroRecorrenciaFrequencia } from '@/services/financeiroRecorrencias';

interface ContasPagarFormPanelProps {
  conta: Partial<ContaPagar> | null;
  onSaveSuccess: (savedConta?: ContaPagar) => void;
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
  const isEditing = !!conta?.id;

  const [isRecorrente, setIsRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState<FinanceiroRecorrenciaFrequencia>('mensal');
  const [ajusteDiaUtil, setAjusteDiaUtil] = useState<FinanceiroRecorrenciaAjusteDiaUtil>('proximo_dia_util');
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState<string>('');
  const [gerarN, setGerarN] = useState<number>(12);

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
      setIsRecorrente(false);
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
      setIsRecorrente(false);
      setFrequencia('mensal');
      setAjusteDiaUtil('proximo_dia_util');
      setHasEndDate(false);
      setEndDate('');
      setGerarN(12);
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
      if (!isEditing && isRecorrente) {
        if (!formData.fornecedor_id) {
          addToast('Fornecedor é obrigatório para recorrência.', 'error');
          return;
        }

        const startDate = String(formData.data_vencimento).slice(0, 10);
        const payload = {
          tipo: 'pagar',
          ativo: true,
          frequencia,
          ajuste_dia_util: ajusteDiaUtil,
          start_date: startDate,
          end_date: hasEndDate ? (endDate || null) : null,
          descricao: formData.descricao,
          documento_ref: formData.documento_ref ?? null,
          observacoes: formData.observacoes ?? null,
          centro_de_custo_id: (formData as any).centro_de_custo_id ?? null,
          fornecedor_id: formData.fornecedor_id,
          valor_total: formData.valor_total,
          categoria: formData.categoria ?? null,
          forma_pagamento: formData.forma_pagamento ?? null,
        };

        const rec = await upsertRecorrencia(payload);
        const gen = await generateRecorrencia({
          recorrenciaId: rec.id,
          until: hasEndDate ? (endDate || null) : null,
          max: Math.max(1, Math.min(240, Number(gerarN) || 12)),
        });

        addToast(
          `Recorrência criada. Contas geradas: ${gen.contas_geradas ?? 0}.`,
          'success',
        );
        onSaveSuccess();
        return;
      }

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
          
          <Input label="Valor Total" name="valor_total" startAdornment="R$" inputMode="numeric" {...valorTotalProps} required className="sm:col-span-3" />
          
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

        {!isEditing ? (
          <Section title="Recorrência" description="Para contas mensais (luz, aluguel, etc.), gere automaticamente as próximas parcelas.">
            <div className="sm:col-span-6 flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white/60 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-800">Conta recorrente</div>
                <div className="text-xs text-gray-500">Cria um modelo e gera as próximas ocorrências automaticamente.</div>
              </div>
              <Switch checked={isRecorrente} onCheckedChange={setIsRecorrente} />
            </div>

            {isRecorrente ? (
              <>
                <Select
                  label="Frequência"
                  name="rec_frequencia"
                  value={frequencia}
                  onChange={(e) => setFrequencia(e.target.value as any)}
                  className="sm:col-span-3"
                >
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </Select>

                <Select
                  label="Ajuste para dia útil"
                  name="rec_ajuste"
                  value={ajusteDiaUtil}
                  onChange={(e) => setAjusteDiaUtil(e.target.value as any)}
                  className="sm:col-span-3"
                >
                  <option value="proximo_dia_util">Próximo dia útil</option>
                  <option value="dia_util_anterior">Dia útil anterior</option>
                  <option value="nao_ajustar">Não ajustar</option>
                </Select>

                <Input
                  label="Gerar próximas (ocorrências)"
                  name="rec_gerar_n"
                  type="number"
                  min={1}
                  max={240}
                  value={String(gerarN)}
                  onChange={(e) => setGerarN(Number(e.target.value))}
                  className="sm:col-span-3"
                  helperText="Dica: para mensal, 12 gera 1 ano."
                />

                <div className="sm:col-span-3 flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white/60 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Definir data final</div>
                    <div className="text-xs text-gray-500">Se desligado, a recorrência fica indeterminada.</div>
                  </div>
                  <Switch checked={hasEndDate} onCheckedChange={setHasEndDate} />
                </div>

                {hasEndDate ? (
                  <Input
                    label="Fim da recorrência"
                    name="rec_end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="sm:col-span-3"
                    required
                  />
                ) : (
                  <div className="sm:col-span-3" />
                )}
              </>
            ) : null}
          </Section>
        ) : null}

        <Section title="Detalhes do Pagamento" description="Informações sobre o pagamento, juros e descontos.">
          <div className="sm:col-span-6 text-sm text-gray-600">
            Para registrar pagamento (e manter a Tesouraria/caixa consistente), use a ação <span className="font-medium">Registrar pagamento</span> na listagem.
          </div>
          <Input label="Data de Pagamento" name="data_pagamento" type="date" value={formData.data_pagamento?.split('T')[0] || ''} disabled className="sm:col-span-2" />
          <Input label="Valor Pago" name="valor_pago" startAdornment="R$" inputMode="numeric" {...valorPagoProps} disabled className="sm:col-span-2" />
          <div className="sm:col-span-2"></div>

          <Input label="Multa" name="multa" startAdornment="R$" inputMode="numeric" {...multaProps} className="sm:col-span-2" />
          <Input label="Juros" name="juros" startAdornment="R$" inputMode="numeric" {...jurosProps} className="sm:col-span-2" />
          <Input label="Desconto" name="desconto" startAdornment="R$" inputMode="numeric" {...descontoProps} className="sm:col-span-2" />

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
            <MeioPagamentoDropdown
              tipo="pagamento"
              value={formData.forma_pagamento || null}
              onChange={(name) => handleFormChange('forma_pagamento', name || '')}
              placeholder="Selecionar…"
            />
          </div>
          <Input label="Categoria" name="categoria" value={formData.categoria || ''} onChange={e => handleFormChange('categoria', e.target.value)} className="sm:col-span-3" />

          <div className="sm:col-span-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo (opcional)</label>
            <CentroDeCustoDropdown
              valueId={(formData as any).centro_de_custo_id || null}
              valueName={formData.centro_custo || null}
              onChange={(id, name) => {
                handleFormChange('centro_de_custo_id' as any, id);
                if (name) handleFormChange('centro_custo' as any, name);
              }}
              placeholder="Selecionar…"
            />
            <div className="mt-1 text-xs text-gray-500">
              Dica: o campo legado <span className="font-medium">centro_custo</span> ainda existe para compatibilidade; ao selecionar aqui, ele é preenchido automaticamente.
            </div>
          </div>

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
