import React, { useState } from 'react';
import { ContatoPayload } from '@/services/partners';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronDown, User } from 'lucide-react';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import TextArea from '../../ui/forms/TextArea';
import { phoneMask } from '@/lib/masks';

interface AdditionalContactsSectionProps {
  contatos: ContatoPayload[];
  onContatosChange: (contatos: ContatoPayload[]) => void;
}

const ContactItem: React.FC<{
  contato: ContatoPayload;
  index: number;
  onUpdate: (index: number, field: keyof ContatoPayload, value: any) => void;
  onRemove: (index: number) => void;
}> = ({ contato, index, onUpdate, onRemove }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border rounded-lg bg-white/60 overflow-hidden">
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 bg-gray-50/50 hover:bg-gray-100/50">
        <div className="flex items-center gap-2">
          <User size={16} className="text-gray-600" />
          <span className="font-medium text-gray-800">{contato.nome || `Contato ${index + 1}`}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(index); }} className="p-1 text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown size={20} /></motion.div>
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nome" value={contato.nome || ''} onChange={e => onUpdate(index, 'nome', e.target.value)} required />
              <Input label="Cargo" value={contato.cargo || ''} onChange={e => onUpdate(index, 'cargo', e.target.value)} />
              <Input label="E-mail" type="email" value={contato.email || ''} onChange={e => onUpdate(index, 'email', e.target.value)} />
              <Input label="Telefone" value={phoneMask(contato.telefone || '')} onChange={e => onUpdate(index, 'telefone', e.target.value)} />
              <div className="sm:col-span-2">
                <TextArea label="Observações" value={contato.observacoes || ''} onChange={e => onUpdate(index, 'observacoes', e.target.value)} rows={2} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AdditionalContactsSection: React.FC<AdditionalContactsSectionProps> = ({ contatos, onContatosChange }) => {
  const handleAdd = () => {
    onContatosChange([...contatos, {}]);
  };

  const handleRemove = (index: number) => {
    onContatosChange(contatos.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, field: keyof ContatoPayload, value: any) => {
    const newContatos = [...contatos];
    newContatos[index] = { ...newContatos[index], [field]: value };
    onContatosChange(newContatos);
  };

  return (
    <Section title="Contatos Adicionais" description="Adicione outros pontos de contato para este parceiro.">
      <div className="sm:col-span-6 space-y-4">
        <AnimatePresence>
          {contatos.map((contato, index) => (
            <motion.div key={contato.id || index} layout>
              <ContactItem contato={contato} index={index} onUpdate={handleUpdate} onRemove={handleRemove} />
            </motion.div>
          ))}
        </AnimatePresence>
        <button type="button" onClick={handleAdd} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50">
          <Plus size={16} /> Adicionar Contato
        </button>
      </div>
    </Section>
  );
};

export default AdditionalContactsSection;
