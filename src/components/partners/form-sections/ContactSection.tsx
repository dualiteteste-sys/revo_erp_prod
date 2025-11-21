import React from 'react';
import { Database } from '@/types/database.types';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import { phoneMask } from '../../../lib/masks';
import TagInput from '../../ui/forms/TagInput';
import TextArea from '../../ui/forms/TextArea';

type Pessoa = Partial<Database['public']['Tables']['pessoas']['Row'] & { celular?: string | null, site?: string | null }>;

interface ContactSectionProps {
  data: Pessoa;
  onPessoaChange: (field: keyof Pessoa, value: any) => void;
}

const ContactSection: React.FC<ContactSectionProps> = ({ data, onPessoaChange }) => {
  return (
    <>
      <Section title="Contato Principal" description="Informações de contato principal do parceiro.">
        <div className="sm:col-span-6 space-y-6">
          <div className="p-4 border rounded-lg bg-gray-50/50 relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="E-mail Principal" name="email" type="email" value={data.email || ''} onChange={e => onPessoaChange('email', e.target.value)} />
              <Input label="Telefone Fixo" name="telefone" value={phoneMask(data.telefone || '')} onChange={e => onPessoaChange('telefone', e.target.value)} />
              <Input label="Celular" name="celular" value={phoneMask(data.celular || '')} onChange={e => onPessoaChange('celular', e.target.value)} />
              <Input label="Site" name="site" type="url" value={data.site || ''} onChange={e => onPessoaChange('site', e.target.value)} placeholder="https://exemplo.com" />
            </div>
          </div>
        </div>
      </Section>
      
      <Section title="Organização" description="Tags e observações para uso interno.">
        <div className="sm:col-span-3">
          <TagInput
            label="Tags de Contato"
            tags={data.contato_tags || []}
            onTagsChange={(tags) => onPessoaChange('contato_tags', tags)}
          />
        </div>
        <div className="sm:col-span-3">
            <TextArea
                label="Observações Gerais"
                name="observacoes"
                value={data.observacoes || ''}
                onChange={(e) => onPessoaChange('observacoes', e.target.value)}
                rows={4}
            />
        </div>
      </Section>
    </>
  );
};

export default ContactSection;
