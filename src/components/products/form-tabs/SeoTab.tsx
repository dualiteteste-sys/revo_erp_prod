import React from 'react';
import { ProductFormData } from '../ProductFormPanel'; // Fixed import path to avoid dependency on empty page file
import Input from '../../ui/forms/Input';
import TextArea from '../../ui/forms/TextArea';
import Section from '../../ui/forms/Section';

interface SeoTabProps {
  data: ProductFormData;
  onChange: (field: keyof ProductFormData, value: any) => void;
}

const SeoTab: React.FC<SeoTabProps> = ({ data, onChange }) => {
  return (
    <div>
        <Section
            title="Otimização para Buscadores (SEO)"
            description="Configure como seu produto aparecerá em resultados de busca como o Google."
        >
            <div className="sm:col-span-2">
                <Input
                    label="Slug (URL Amigável)"
                    name="slug"
                    value={data.slug || ''}
                    onChange={(e) => onChange('slug', e.target.value)}
                    placeholder="ex: nome-do-produto-incrivel"
                />
            </div>
            <div className="sm:col-span-2">
                <Input
                    label="Título para SEO"
                    name="seo_titulo"
                    value={data.seo_titulo || ''}
                    onChange={(e) => onChange('seo_titulo', e.target.value)}
                    placeholder="Título que aparecerá no Google (máx 70 caracteres)"
                />
            </div>
            <div className="sm:col-span-2">
                <TextArea
                    label="Descrição para SEO"
                    name="seo_descricao"
                    value={data.seo_descricao || ''}
                    onChange={(e) => onChange('seo_descricao', e.target.value)}
                    placeholder="Descrição que aparecerá no Google (máx 160 caracteres)"
                    rows={3}
                />
            </div>
            <div className="sm:col-span-2">
                <Input
                    label="Palavras-chave"
                    name="keywords"
                    value={data.keywords || ''}
                    onChange={(e) => onChange('keywords', e.target.value)}
                    placeholder="Separadas por vírgula: palavra1, palavra2, palavra3"
                />
            </div>
        </Section>
    </div>
  );
};

export default SeoTab;
