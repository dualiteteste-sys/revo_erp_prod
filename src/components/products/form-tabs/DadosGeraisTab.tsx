import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import { tipo_produto, status_produto } from '../../../types/database.types';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import Select from '../../ui/forms/Select';
import Toggle from '../../ui/forms/Toggle';
import TextArea from '../../ui/forms/TextArea';
import { useNumericField } from '../../../hooks/useNumericField';
import FiscalFields from '../form-sections/FiscalFields';
import PackagingFields from '../form-sections/PackagingFields';

const tipoProdutoOptions: { value: tipo_produto; label: string }[] = [
  { value: 'simples', label: 'Simples' },
  { value: 'kit', label: 'Kit' },
  { value: 'variacoes', label: 'Com Variações' },
  { value: 'fabricado', label: 'Fabricado' },
  { value: 'materia_prima', label: 'Matéria-Prima' },
];

const statusProdutoOptions: { value: status_produto; label: string }[] = [
    { value: 'ativo', label: 'Ativo' },
    { value: 'inativo', label: 'Inativo' },
];

interface FormErrors {
  nome?: string;
}

interface DadosGeraisTabProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
  errors: FormErrors;
}

const DadosGeraisTab: React.FC<DadosGeraisTabProps> = ({ data, onChange, errors }) => {
  const precoVendaProps = useNumericField(data.preco_venda, (value) => onChange('preco_venda', value));
  const estoqueMinProps = useNumericField(data.estoque_min, (value) => onChange('estoque_min', value));
  const estoqueMaxProps = useNumericField(data.estoque_max, (value) => onChange('estoque_max', value));

  return (
    <div>
      <Section
        title="Identificação"
        description="Informações básicas para identificar seu produto."
      >
        <Input
            label={<>Nome do Produto <span className="text-red-500">*</span></>}
            name="nome"
            value={data.nome || ''}
            onChange={(e) => onChange('nome', e.target.value)}
            required
            className="sm:col-span-6"
            placeholder="Ex: Camiseta de Algodão Pima"
            error={errors.nome}
        />
        <Input
            label="Unidade"
            name="unidade"
            value={data.unidade || 'un'}
            onChange={(e) => onChange('unidade', e.target.value)}
            className="sm:col-span-2"
            placeholder="Ex: un, kg, m, pç"
        />
        <Input
            label="Preço de Venda"
            name="preco_venda"
            type="text"
            {...precoVendaProps}
            className="sm:col-span-2"
            placeholder="0,00"
            endAdornment="R$"
        />
        <div className="sm:col-span-2" />
        <Input
            label="SKU"
            name="sku"
            value={data.sku || ''}
            onChange={(e) => onChange('sku', e.target.value)}
            className="sm:col-span-3"
            placeholder="Código interno do produto"
        />
        <Input
            label="GTIN / EAN"
            name="gtin"
            value={data.gtin || ''}
            onChange={(e) => onChange('gtin', e.target.value)}
            className="sm:col-span-3"
            placeholder="Código de barras"
        />
        <Select
            label="Status"
            name="status"
            value={data.status || 'ativo'}
            onChange={(e) => onChange('status', e.target.value)}
            className="sm:col-span-3"
        >
            {statusProdutoOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </Select>
        <Select
            label="Tipo do produto"
            name="tipo"
            value={data.tipo || 'simples'}
            onChange={(e) => onChange('tipo', e.target.value)}
            className="sm:col-span-3"
        >
            {tipoProdutoOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </Select>
        <TextArea
            label="Descrição"
            name="descricao"
            value={data.descricao || ''}
            onChange={(e) => onChange('descricao', e.target.value)}
            rows={3}
            className="sm:col-span-6"
            placeholder="Detalhes do produto, características, etc."
        />
      </Section>

      <FiscalFields data={data} onChange={onChange} />

      <PackagingFields data={data} onChange={onChange} />
      
      <Section
        title="Estoque"
        description="Configurações de controle de estoque e disponibilidade."
      >
        <div className="sm:col-span-6">
            <Toggle
                label="Controlar estoque deste item?"
                name="controla_estoque"
                checked={!!data.controla_estoque}
                onChange={(checked) => onChange('controla_estoque', checked)}
                description="Habilite para gerenciar o saldo de estoque do produto."
            />
        </div>
        {data.controla_estoque && (
            <>
                <Input
                    label="Estoque mínimo"
                    name="estoque_min"
                    type="text"
                    {...estoqueMinProps}
                    className="sm:col-span-3"
                    placeholder="Nível para alerta de reposição"
                />
                <Input
                    label="Estoque máximo"
                    name="estoque_max"
                    type="text"
                    {...estoqueMaxProps}
                    className="sm:col-span-3"
                />
                <Input
                    label="Localização"
                    name="localizacao"
                    type="text"
                    value={data.localizacao || ''}
                    onChange={(e) => onChange('localizacao', e.target.value)}
                    placeholder="Ex: Corredor A, Prateleira 3"
                    className="sm:col-span-3"
                />
                <Input
                    label="Dias para preparação"
                    name="dias_preparacao"
                    type="number"
                    value={data.dias_preparacao || ''}
                    onChange={(e) => onChange('dias_preparacao', parseInt(e.target.value, 10) || 0)}
                    className="sm:col-span-3"
                    placeholder="Tempo para envio após a compra"
                />
            </>
        )}
      </Section>
    </div>
  );
};

export default DadosGeraisTab;
