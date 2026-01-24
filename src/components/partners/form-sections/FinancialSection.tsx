import React from 'react';
import { Database } from '@/types/database.types';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import TextArea from '../../ui/forms/TextArea';
import { useNumericField } from '../../../hooks/useNumericField';
import Select from '@/components/ui/forms/Select';
import { searchCondicoesPagamento, type CondicaoPagamento } from '@/services/condicoesPagamento';

type Pessoa = Partial<Database['public']['Tables']['pessoas']['Row'] & {
  limite_credito?: number | null;
  condicao_pagamento?: string | null;
  informacoes_bancarias?: string | null;
}>;

interface FinancialSectionProps {
  data: Pessoa;
  onChange: (field: keyof Pessoa, value: any) => void;
}

const FinancialSection: React.FC<FinancialSectionProps> = ({ data, onChange }) => {
  const limiteCreditoProps = useNumericField(data.limite_credito, (value) => onChange('limite_credito', value));
  const [condicoes, setCondicoes] = React.useState<CondicaoPagamento[]>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await searchCondicoesPagamento({ tipo: 'ambos', q: null, limit: 50 });
        if (!alive) return;
        setCondicoes(rows ?? []);
      } catch {
        if (!alive) return;
        setCondicoes([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const condicaoValue = (data.condicao_pagamento || '').trim();
  const isPreset = React.useMemo(() => {
    if (!condicaoValue) return false;
    return condicoes.some((c) => (c.condicao || '').trim() === condicaoValue);
  }, [condicoes, condicaoValue]);

  return (
    <Section title="Financeiro" description="Dados financeiros e de crédito do parceiro.">
      <div className="sm:col-span-6 space-y-6">
        <div className="p-4 border rounded-lg bg-gray-50/50 relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Limite de Crédito"
              name="limite_credito"
              type="text"
              inputMode="numeric"
              {...limiteCreditoProps}
              startAdornment="R$"
              placeholder="0,00"
            />
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Condição de Pagamento"
                name="condicao_pagamento_preset"
                value={isPreset ? condicaoValue : ''}
                onChange={(e) => onChange('condicao_pagamento', e.target.value)}
              >
                <option value="">Personalizada</option>
                {condicoes.map((c) => (
                  <option key={c.id} value={c.condicao}>
                    {c.nome} • {c.condicao}
                  </option>
                ))}
              </Select>
              <Input
                label="Personalizada (opcional)"
                name="condicao_pagamento_custom"
                value={isPreset ? '' : condicaoValue}
                onChange={(e) => onChange('condicao_pagamento', e.target.value)}
                placeholder="Ex: 30/60/90"
                disabled={isPreset}
              />
            </div>
            <div className="sm:col-span-2">
              <TextArea
                label="Informações Bancárias"
                name="informacoes_bancarias"
                value={data.informacoes_bancarias || ''}
                onChange={(e) => onChange('informacoes_bancarias', e.target.value)}
                rows={3}
                placeholder="Banco, Agência, Conta, etc."
              />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
};

export default FinancialSection;
