import React from 'react';
import { ProductFormData } from '../ProductFormPanel';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';

interface AdditionalDataTabProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const AdditionalDataTab: React.FC<AdditionalDataTabProps> = ({ data, onChange }) => {
  return (
    <div>
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

      <Section
        title="Classificação e Relacionamentos"
        description="Associações com marcas e outros produtos."
      >
         <div className="sm:col-span-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-500 border border-gray-200">
            <p>Funcionalidades de Marca e Variações estarão disponíveis em breve.</p>
         </div>
      </Section>
    </div>
  );
};

export default AdditionalDataTab;
