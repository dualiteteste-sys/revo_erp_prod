import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import Toggle from '../../ui/forms/Toggle';
import TextArea from '../../ui/forms/TextArea';
import { useNumericField } from '../../../hooks/useNumericField';

interface OthersTabProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const OthersTab: React.FC<OthersTabProps> = ({ data, onChange }) => {
  const precoCustoProps = useNumericField(data.preco_custo, (value) => onChange('preco_custo', value));
  const markupProps = useNumericField(data.markup, (value) => onChange('markup', value));
  const valorIpiFixoProps = useNumericField(data.valor_ipi_fixo, (value) => onChange('valor_ipi_fixo', value));
  const fatorConversaoProps = useNumericField(data.fator_conversao, (value) => onChange('fator_conversao', value));

  return (
    <div>
      <Section
        title="Dados Comerciais"
        description="Informações para gestão de vendas e custos."
      >
        <Input
          label="Preço de Custo (R$)"
          name="preco_custo"
          type="text"
          {...precoCustoProps}
        />
        <Input
          label="Markup (%)"
          name="markup"
          type="text"
          {...markupProps}
          placeholder="Ex: 0.5 para 50%"
        />
        <Input
          label="Garantia (meses)"
          name="garantia_meses"
          type="number"
          value={data.garantia_meses || ''}
          onChange={(e) => onChange('garantia_meses', parseInt(e.target.value, 10) || null)}
        />
        <Input
          label="Itens por Caixa"
          name="itens_por_caixa"
          type="number"
          value={data.itens_por_caixa || ''}
          onChange={(e) => onChange('itens_por_caixa', parseInt(e.target.value, 10) || 0)}
        />
        <div className="sm:col-span-2">
            <Toggle
                label="Permitir Inclusão em Vendas"
                name="permitir_inclusao_vendas"
                checked={data.permitir_inclusao_vendas ?? true}
                onChange={(checked) => onChange('permitir_inclusao_vendas', checked)}
            />
        </div>
      </Section>

      <Section
        title="Informações Tributárias Adicionais"
        description="Dados para cenários fiscais específicos."
      >
        <Input
          label="GTIN Tributável (Caixa/Fardo)"
          name="gtin_tributavel"
          value={data.gtin_tributavel || ''}
          onChange={(e) => onChange('gtin_tributavel', e.target.value)}
        />
        <Input
          label="Unidade Tributável"
          name="unidade_tributavel"
          value={data.unidade_tributavel || ''}
          onChange={(e) => onChange('unidade_tributavel', e.target.value)}
          placeholder="Ex: CX, FD"
        />
        <Input
          label="Fator de Conversão"
          name="fator_conversao"
          type="text"
          {...fatorConversaoProps}
        />
        <Input
          label="Cód. Enquadramento IPI"
          name="codigo_enquadramento_ipi"
          value={data.codigo_enquadramento_ipi || ''}
          onChange={(e) => onChange('codigo_enquadramento_ipi', e.target.value)}
        />
        <Input
          label="Valor Fixo de IPI (R$)"
          name="valor_ipi_fixo"
          type="text"
          {...valorIpiFixoProps}
        />
        <Input
          label="Cód. Enq. Legal IPI"
          name="codigo_enquadramento_legal_ipi"
          value={data.codigo_enquadramento_legal_ipi || ''}
          onChange={(e) => onChange('codigo_enquadramento_legal_ipi', e.target.value)}
        />
        <Input
          label="EX TIPI"
          name="ex_tipi"
          value={data.ex_tipi || ''}
          onChange={(e) => onChange('ex_tipi', e.target.value)}
        />
      </Section>
      
      <Section
        title="Observações Internas"
        description="Anotações que não serão exibidas para seus clientes."
      >
        <div className="sm:col-span-2">
            <TextArea
                label="Observações"
                name="observacoes_internas"
                value={data.observacoes_internas || ''}
                onChange={(e) => onChange('observacoes_internas', e.target.value)}
                rows={4}
            />
        </div>
      </Section>
    </div>
  );
};

export default OthersTab;
