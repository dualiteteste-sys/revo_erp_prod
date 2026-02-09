import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ContaCorrente, transferirEntreContas } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Select from '@/components/ui/forms/Select';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import { Button } from '@/components/ui/button';

interface Props {
  contas: ContaCorrente[];
  defaultContaOrigemId?: string | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function TransferenciaEntreContasFormPanel({
  contas,
  defaultContaOrigemId,
  onSaveSuccess,
  onClose,
}: Props) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    conta_origem_id: '',
    conta_destino_id: '',
    valor: 0,
    data_movimento: new Date().toISOString().split('T')[0],
    descricao: '',
    documento_ref: '',
    observacoes: '',
  });

  const valorProps = useNumericField(formData.valor, (value) => {
    setFormData((prev) => ({ ...prev, valor: value ?? 0 }));
  });

  const contasDestino = useMemo(
    () => contas.filter((conta) => conta.id !== formData.conta_origem_id),
    [contas, formData.conta_origem_id]
  );

  useEffect(() => {
    const origemInicial = defaultContaOrigemId && contas.some((conta) => conta.id === defaultContaOrigemId)
      ? defaultContaOrigemId
      : contas[0]?.id ?? '';
    const destinoInicial = contas.find((conta) => conta.id !== origemInicial)?.id ?? '';
    setFormData((prev) => ({
      ...prev,
      conta_origem_id: origemInicial,
      conta_destino_id: destinoInicial,
    }));
  }, [contas, defaultContaOrigemId]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleOrigemChange = (contaOrigemId: string) => {
    setFormData((prev) => {
      const nextDestino =
        prev.conta_destino_id && prev.conta_destino_id !== contaOrigemId
          ? prev.conta_destino_id
          : contas.find((conta) => conta.id !== contaOrigemId)?.id ?? '';
      return {
        ...prev,
        conta_origem_id: contaOrigemId,
        conta_destino_id: nextDestino,
      };
    });
  };

  const handleSave = async () => {
    if (contas.length < 2) {
      addToast('Cadastre ao menos duas contas correntes para realizar transferências.', 'error');
      return;
    }
    if (!formData.conta_origem_id || !formData.conta_destino_id) {
      addToast('Selecione a conta de origem e a conta de destino.', 'error');
      return;
    }
    if (formData.conta_origem_id === formData.conta_destino_id) {
      addToast('Selecione contas diferentes para origem e destino.', 'error');
      return;
    }
    if (!formData.valor || formData.valor <= 0) {
      addToast('Informe um valor maior que zero.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await transferirEntreContas({
        conta_origem_id: formData.conta_origem_id,
        conta_destino_id: formData.conta_destino_id,
        valor: formData.valor,
        data_movimento: formData.data_movimento,
        descricao: formData.descricao || null,
        documento_ref: formData.documento_ref || null,
        observacoes: formData.observacoes || null,
      });

      addToast('Transferência registrada com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível registrar a transferência.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section
          title="Transferência entre contas"
          description="Registre a saída e a entrada em uma única ação, mantendo o histórico para análise e conciliação."
        >
          <Select
            label="Conta de Origem"
            name="conta_origem"
            value={formData.conta_origem_id}
            onChange={(e) => handleOrigemChange(e.target.value)}
            className="sm:col-span-3"
          >
            <option value="">Selecione...</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome}
              </option>
            ))}
          </Select>

          <Select
            label="Conta de Destino"
            name="conta_destino"
            value={formData.conta_destino_id}
            onChange={(e) => handleChange('conta_destino_id', e.target.value)}
            className="sm:col-span-3"
          >
            <option value="">Selecione...</option>
            {contasDestino.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome}
              </option>
            ))}
          </Select>

          <Input
            label="Valor"
            name="valor_transferencia"
            startAdornment="R$"
            inputMode="numeric"
            className="sm:col-span-2"
            {...valorProps}
          />

          <Input
            label="Data"
            name="data_movimento_transferencia"
            type="date"
            value={formData.data_movimento}
            onChange={(e) => handleChange('data_movimento', e.target.value)}
            className="sm:col-span-2"
          />

          <Input
            label="Documento Ref."
            name="documento_ref_transferencia"
            value={formData.documento_ref}
            onChange={(e) => handleChange('documento_ref', e.target.value)}
            className="sm:col-span-2"
          />

          <Input
            label="Descrição (opcional)"
            name="descricao_transferencia"
            value={formData.descricao}
            onChange={(e) => handleChange('descricao', e.target.value)}
            placeholder="Ex: resgate de aplicação"
            className="sm:col-span-6"
          />

          <TextArea
            label="Observações"
            name="observacoes_transferencia"
            value={formData.observacoes}
            onChange={(e) => handleChange('observacoes', e.target.value)}
            rows={3}
            className="sm:col-span-6"
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Confirmar transferência
          </Button>
        </div>
      </footer>
    </div>
  );
}
