import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { saveContaPagar, type ContaPagarPayload } from '@/services/financeiro';
import { upsertRecorrencia, generateRecorrencia, type FinanceiroRecorrenciaFrequencia, type FinanceiroRecorrenciaAjusteDiaUtil } from '@/services/financeiroRecorrencias';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';
import { Switch } from '@/components/ui/switch';

type QuickCreateContaPagarPanelProps = {
  /** Fixed payment method — shown as disabled input (empty string hides the field) */
  formaPagamento: string;
  initialValues?: {
    descricao?: string;
    valor_total?: number;
    data_vencimento?: string;
    documento_ref?: string;
  };
  onSaveSuccess: () => void;
  onClose: () => void;
};

export default function QuickCreateContaPagarPanel({
  formaPagamento,
  initialValues,
  onSaveSuccess,
  onClose,
}: QuickCreateContaPagarPanelProps) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ContaPagarPayload>>({
    status: 'aberta',
    valor_total: initialValues?.valor_total ?? 0,
    valor_pago: 0,
    forma_pagamento: formaPagamento || undefined,
    descricao: initialValues?.descricao ?? undefined,
    data_vencimento: initialValues?.data_vencimento ?? undefined,
    documento_ref: initialValues?.documento_ref ?? undefined,
  });
  const [fornecedorName, setFornecedorName] = useState('');

  // Recurrence state
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState<FinanceiroRecorrenciaFrequencia>('mensal');
  const [ajusteDiaUtil, setAjusteDiaUtil] = useState<FinanceiroRecorrenciaAjusteDiaUtil>('proximo_dia_util');
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState<string>('');
  const [gerarN, setGerarN] = useState<number>(12);

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
      if (isRecorrente) {
        if (!formData.fornecedor_id) {
          addToast('Fornecedor é obrigatório para recorrência.', 'error');
          setIsSaving(false);
          return;
        }
        const startDate = String(formData.data_vencimento).slice(0, 10);
        const payload = {
          tipo: 'pagar' as const,
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
          forma_pagamento: formaPagamento || formData.forma_pagamento || null,
        };
        const rec = await upsertRecorrencia(payload);
        const gen = await generateRecorrencia({
          recorrenciaId: rec.id,
          until: hasEndDate ? (endDate || null) : null,
          max: Math.max(1, Math.min(240, Number(gerarN) || 12)),
        });
        addToast(`Recorrência criada. Contas geradas: ${gen.contas_geradas ?? 0}.`, 'success');
      } else {
        await saveContaPagar({ ...formData, forma_pagamento: formaPagamento || formData.forma_pagamento });
        addToast('Conta a pagar criada com sucesso!', 'success');
      }
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

          {formaPagamento ? (
            <Input
              label="Forma de Pagamento"
              name="forma_pagamento"
              value={formaPagamento}
              disabled
              className="sm:col-span-3"
            />
          ) : null}

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
              allowedTipos={['despesa']}
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
            {isRecorrente ? 'Criar Recorrência' : 'Salvar Conta'}
          </button>
        </div>
      </footer>
    </div>
  );
}
