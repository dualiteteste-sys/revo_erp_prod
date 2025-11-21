import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import { tipo_embalagem } from '../../../types/database.types';
import Section from '../../ui/forms/Section';
import Select from '../../ui/forms/Select';
import Input from '../../ui/forms/Input';
import PackagingIllustration from '../PackagingIllustration';
import { useNumericField } from '../../../hooks/useNumericField';
import { motion, AnimatePresence } from 'framer-motion';

const tipoEmbalagemOptions: { value: tipo_embalagem; label: string }[] = [
    { value: 'pacote_caixa', label: 'Pacote / Caixa' },
    { value: 'envelope', label: 'Envelope' },
    { value: 'rolo_cilindro', label: 'Rolo / Cilindro' },
    { value: 'outro', label: 'Outro' },
];

interface PackagingFieldsProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const DimensionInput: React.FC<{
    name: keyof ProductFormData;
    label: string;
    data: ProductFormData;
    onChange: (field: keyof ProductFormData, value: any) => void;
}> = ({ name, label, data, onChange }) => {
    const numericProps = useNumericField(data[name] as number | null | undefined, (value) => onChange(name, value));
    return (
        <Input
            label={label}
            name={name as string}
            type="text"
            {...numericProps}
            endAdornment="cm"
            placeholder="0,0"
        />
    );
};

const PackagingFields: React.FC<PackagingFieldsProps> = ({ data, onChange }) => {
  const tipoEmbalagem = data.tipo_embalagem || 'pacote_caixa';

  const pesoLiquidoProps = useNumericField(data.peso_liquido_kg, (value) => onChange('peso_liquido_kg', value));
  const pesoBrutoProps = useNumericField(data.peso_bruto_kg, (value) => onChange('peso_bruto_kg', value));

  const renderDimensionFields = () => {
    switch (tipoEmbalagem) {
      case 'pacote_caixa':
        return (
          <>
            <DimensionInput name="largura_cm" label="Largura" data={data} onChange={onChange} />
            <DimensionInput name="altura_cm" label="Altura" data={data} onChange={onChange} />
            <DimensionInput name="comprimento_cm" label="Comprimento" data={data} onChange={onChange} />
          </>
        );
      case 'envelope':
        return (
          <>
            <DimensionInput name="largura_cm" label="Largura" data={data} onChange={onChange} />
            <DimensionInput name="comprimento_cm" label="Comprimento" data={data} onChange={onChange} />
          </>
        );
      case 'rolo_cilindro':
        return (
          <>
            <DimensionInput name="comprimento_cm" label="Comprimento" data={data} onChange={onChange} />
            <DimensionInput name="diametro_cm" label="Diâmetro" data={data} onChange={onChange} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Section
      title="Dimensões e peso"
      description="Informações logísticas para cálculo de frete e envio."
    >
      <div className="sm:col-span-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 flex flex-col justify-center">
          <Select
            label="Tipo de embalagem"
            name="tipo_embalagem"
            value={tipoEmbalagem}
            onChange={(e) => onChange('tipo_embalagem', e.target.value)}
          >
            {tipoEmbalagemOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
          <PackagingIllustration type={tipoEmbalagem} />
        </div>
        <div className="md:col-span-2 grid grid-cols-3 gap-4">
          <Select
            label="Embalagem"
            name="embalagem"
            value={data.embalagem || 'custom'}
            onChange={(e) => onChange('embalagem', e.target.value)}
            className="col-span-3"
          >
            <option value="custom">Embalagem Customizada</option>
          </Select>

          <Input
            label="Peso líquido"
            name="peso_liquido_kg"
            type="text"
            {...pesoLiquidoProps}
            endAdornment="kg"
            placeholder="0,000"
          />
          <Input
            label="Peso bruto"
            name="peso_bruto_kg"
            type="text"
            {...pesoBrutoProps}
            endAdornment="kg"
            placeholder="0,000"
          />
          <Input
            label="Nº de volumes"
            name="num_volumes"
            type="number"
            value={data.num_volumes || '1'}
            onChange={(e) => onChange('num_volumes', parseInt(e.target.value, 10) || 1)}
            placeholder="1"
          />
          <AnimatePresence mode="wait">
            <motion.div
                key={tipoEmbalagem}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="col-span-3 grid grid-cols-3 gap-4"
            >
                {renderDimensionFields()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
};

export default PackagingFields;
