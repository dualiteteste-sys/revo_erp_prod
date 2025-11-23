import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import Select from '../../ui/forms/Select';
import { useNumericField } from '@/hooks/useNumericField';
import PackagingIllustration from '../PackagingIllustration';
import { tipo_embalagem } from '@/types/database.types';

interface PackagingFieldsProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const packagingTypes: { value: tipo_embalagem; label: string }[] = [
  { value: 'pacote_caixa', label: 'Pacote / Caixa' },
  { value: 'envelope', label: 'Envelope' },
  { value: 'rolo_cilindro', label: 'Rolo / Cilindro' },
  { value: 'outro', label: 'Outro' },
];

const PackagingFields: React.FC<PackagingFieldsProps> = ({ data, onChange }) => {
  const pesoLiquidoProps = useNumericField(data.peso_liquido_kg, (v) => onChange('peso_liquido_kg', v));
  const pesoBrutoProps = useNumericField(data.peso_bruto_kg, (v) => onChange('peso_bruto_kg', v));
  
  const alturaProps = useNumericField(data.altura_cm, (v) => onChange('altura_cm', v));
  const larguraProps = useNumericField(data.largura_cm, (v) => onChange('largura_cm', v));
  const comprimentoProps = useNumericField(data.comprimento_cm, (v) => onChange('comprimento_cm', v));
  const diametroProps = useNumericField(data.diametro_cm, (v) => onChange('diametro_cm', v));

  const type = data.tipo_embalagem || 'pacote_caixa';

  return (
    <Section
      title="Dimensões e Peso"
      description="Dados para cálculo de frete e logística."
    >
      <div className="sm:col-span-3">
        <Select
          label="Formato da Embalagem"
          name="tipo_embalagem"
          value={type}
          onChange={(e) => onChange('tipo_embalagem', e.target.value)}
        >
          {packagingTypes.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </Select>

        <div className="grid grid-cols-2 gap-4 mt-4">
           <Input
            label="Peso Líquido (kg)"
            name="peso_liquido_kg"
            type="text"
            {...pesoLiquidoProps}
            placeholder="0,000"
          />
          <Input
            label="Peso Bruto (kg)"
            name="peso_bruto_kg"
            type="text"
            {...pesoBrutoProps}
            placeholder="0,000"
          />
        </div>
      </div>

      <div className="sm:col-span-3 flex flex-col items-center justify-center bg-gray-50 rounded-lg p-4 border border-gray-200">
         <PackagingIllustration type={type} />
         <div className="grid grid-cols-3 gap-2 w-full mt-4">
            {(type === 'pacote_caixa' || type === 'envelope') && (
                <Input label="Largura (cm)" name="largura_cm" {...larguraProps} />
            )}
            {(type === 'pacote_caixa') && (
                <Input label="Altura (cm)" name="altura_cm" {...alturaProps} />
            )}
            {(type === 'pacote_caixa' || type === 'envelope' || type === 'rolo_cilindro') && (
                <Input label="Comprimento (cm)" name="comprimento_cm" {...comprimentoProps} />
            )}
            {(type === 'rolo_cilindro') && (
                <Input label="Diâmetro (cm)" name="diametro_cm" {...diametroProps} />
            )}
         </div>
      </div>
    </Section>
  );
};

export default PackagingFields;
