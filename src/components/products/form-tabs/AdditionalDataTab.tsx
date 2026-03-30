import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import Select from '../../ui/forms/Select';
import { useNumericField } from '../../../hooks/useNumericField';

// Extend until database types are regenerated
type ExtendedFormData = ProductFormData & {
  condicao?: string | null;
  pais_origem?: string | null;
  fabricante?: string | null;
  modelo?: string | null;
  preco_promocional?: number | null;
};

interface AdditionalDataTabProps {
  data: ExtendedFormData;
  onChange: (field: keyof ExtendedFormData, value: any) => void;
}

const AdditionalDataTab: React.FC<AdditionalDataTabProps> = ({ data, onChange }) => {
  const precoPromoProps = useNumericField(data.preco_promocional, (value) => onChange('preco_promocional', value));

  return (
    <div>
      <Section
        title="Informações para Marketplace"
        description="Dados exigidos por marketplaces como Mercado Livre, Shopee, Amazon e outros."
      >
        <Select
          label="Condição"
          name="condicao"
          value={data.condicao || 'novo'}
          onChange={(e) => onChange('condicao', e.target.value)}
          className="sm:col-span-2"
        >
          <option value="novo">Novo</option>
          <option value="usado">Usado</option>
          <option value="recondicionado">Recondicionado</option>
        </Select>
        <Input
          label="País de Origem"
          name="pais_origem"
          value={data.pais_origem || 'BR'}
          onChange={(e) => onChange('pais_origem', e.target.value)}
          placeholder="BR"
          className="sm:col-span-2"
        />
        <Input
          label="Preço Promocional"
          name="preco_promocional"
          type="text"
          inputMode="numeric"
          {...precoPromoProps}
          className="sm:col-span-2"
          placeholder="0,00"
          startAdornment="R$"
        />
        <Input
          label="Fabricante"
          name="fabricante"
          value={data.fabricante || ''}
          onChange={(e) => onChange('fabricante', e.target.value)}
          placeholder="Ex: Samsung, LG, Tramontina..."
          className="sm:col-span-3"
        />
        <Input
          label="Modelo"
          name="modelo"
          value={data.modelo || ''}
          onChange={(e) => onChange('modelo', e.target.value)}
          placeholder="Ex: Galaxy S24, QN55Q60B..."
          className="sm:col-span-3"
        />
      </Section>

      <Section
        title="Mídia Externa"
        description="Links para vídeos e recursos externos."
      >
        <Input
          label="URL do Vídeo (YouTube/Vimeo)"
          name="video_url"
          value={data.video_url || ''}
          onChange={(e) => onChange('video_url', e.target.value)}
          placeholder="https://..."
          className="sm:col-span-6"
        />
      </Section>
    </div>
  );
};

export default AdditionalDataTab;
