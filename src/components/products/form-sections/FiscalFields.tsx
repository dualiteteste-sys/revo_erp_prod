import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import Section from '../../ui/forms/Section';
import Select from '../../ui/forms/Select';
import Input from '../../ui/forms/Input';
import NcmSearch from '../NcmSearch';

const icmsOrigemOptions = [
  { value: 0, label: '0 - Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8' },
  { value: 1, label: '1 - Estrangeira - Importação direta' },
  { value: 2, label: '2 - Estrangeira - Adquirida no mercado interno' },
  { value: 3, label: '3 - Nacional, com Conteúdo de Importação superior a 40% e inferior ou igual a 70%' },
  { value: 4, label: '4 - Nacional, produção em conformidade com os processos produtivos básicos' },
  { value: 5, label: '5 - Nacional, com Conteúdo de Importação inferior ou igual a 40%' },
  { value: 6, label: '6 - Estrangeira - Importação direta, sem similar nacional, na lista da CAMEX' },
  { value: 7, label: '7 - Estrangeira - Adquirida no mercado interno, sem similar nacional, na lista da CAMEX' },
  { value: 8, label: '8 - Nacional, com Conteúdo de Importação superior a 70%' },
];

interface FiscalFieldsProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const FiscalFields: React.FC<FiscalFieldsProps> = ({ data, onChange }) => {
  return (
    <Section
      title="Fiscal"
      description="Informações necessárias para a emissão de notas fiscais."
    >
      <Select
        label="Origem da mercadoria"
        name="icms_origem"
        value={data.icms_origem ?? 0}
        onChange={(e) => onChange('icms_origem', parseInt(e.target.value, 10))}
        className="sm:col-span-6"
      >
        {icmsOrigemOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </Select>
      <NcmSearch
        value={data.ncm || ''}
        onChange={(value) => onChange('ncm', value)}
      />
      <Input
        label="CEST"
        name="cest"
        value={data.cest || ''}
        onChange={(e) => onChange('cest', e.target.value)}
        placeholder="00.000.00"
        className="sm:col-span-3"
      />
    </Section>
  );
};

export default FiscalFields;
