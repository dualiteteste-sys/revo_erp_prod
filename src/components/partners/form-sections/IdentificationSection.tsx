import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Database } from '@/types/database.types';
import Section from '../../ui/forms/Section';
import Input from '../../ui/forms/Input';
import Select from '../../ui/forms/Select';
import { useToast } from '../../../contexts/ToastProvider';
import { fetchCnpjData } from '../../../services/externalApis';
import { AnimatePresence, motion } from 'framer-motion';
import { documentMask } from '../../../lib/masks';

type Pessoa = Database['public']['Tables']['pessoas']['Row'];
type TipoPessoa = Database['public']['Enums']['tipo_pessoa_enum'];

interface IdentificationSectionProps {
  data: Partial<Pessoa>;
  onChange: (field: keyof Pessoa, value: any) => void;
  onCnpjDataFetched: (data: any) => void;
}

const tipoPessoaOptions: { value: TipoPessoa; label: string }[] = [
  { value: 'juridica', label: 'Pessoa Jurídica' },
  { value: 'fisica', label: 'Pessoa Física' },
  { value: 'estrangeiro', label: 'Estrangeiro' },
];

const contribuinteOptions = [
    { value: '1', label: '1 - Contribuinte ICMS' },
    { value: '2', label: '2 - Contribuinte isento de Inscrição' },
    { value: '9', label: '9 - Não Contribuinte' },
];


const IdentificationSection: React.FC<IdentificationSectionProps> = ({ data, onChange, onCnpjDataFetched }) => {
  const { addToast } = useToast();
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const tipoPessoa = data.tipo_pessoa || 'juridica';

  const handleFetchCnpj = async () => {
    if (!data.doc_unico) return;
    setIsFetchingCnpj(true);
    try {
      const apiData = await fetchCnpjData(data.doc_unico);
      onCnpjDataFetched(apiData);
      addToast('Dados do CNPJ preenchidos!', 'success');
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsFetchingCnpj(false);
    }
  };
  
  const getDocumentLabel = () => {
    switch (tipoPessoa) {
      case 'fisica': return 'CPF';
      case 'juridica': return 'CNPJ';
      case 'estrangeiro': return 'Documento Estrangeiro';
      default: return 'Documento';
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const maskedValue = documentMask(e.target.value);
    onChange('doc_unico', maskedValue);
  };

  return (
    <Section title="Dados Gerais" description="Informações de identificação do cliente ou fornecedor.">
      {/* --- ROW 1 --- */}
      <Select label="Tipo de pessoa" name="tipo_pessoa" value={tipoPessoa} onChange={e => onChange('tipo_pessoa', e.target.value)} required className="sm:col-span-2">
        {tipoPessoaOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </Select>

      <div className="sm:col-span-2">
        <label htmlFor="doc_unico" className="block text-sm font-medium text-gray-700 mb-1">{getDocumentLabel()}</label>
        <div className="relative">
          <input
            id="doc_unico" name="doc_unico" value={data.doc_unico || ''} onChange={handleDocumentChange}
            className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm pr-12"
          />
          {tipoPessoa === 'juridica' && (
            <button
              type="button" onClick={handleFetchCnpj} disabled={isFetchingCnpj || !data.doc_unico}
              className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed"
              aria-label="Buscar dados do CNPJ com IA"
            >
              {isFetchingCnpj ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            </button>
          )}
        </div>
      </div>

      <div className="sm:col-span-2">
        <Input label="Código" name="codigo_externo" value={data.codigo_externo || ''} onChange={e => onChange('codigo_externo', e.target.value)} placeholder="Opcional" />
      </div>

      {/* --- ROW 2 --- */}
      <motion.div
        layout
        className="sm:col-span-3"
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <Input
          label={tipoPessoa === 'fisica' ? "Nome Completo" : "Nome / Razão Social"}
          name="nome"
          value={data.nome || ''}
          onChange={e => onChange('nome', e.target.value)}
          required
        />
      </motion.div>
      
      <AnimatePresence>
        {tipoPessoa === 'juridica' && (
            <motion.div 
                className="sm:col-span-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
            >
              <Input label="Fantasia" name="fantasia" value={data.fantasia || ''} onChange={e => onChange('fantasia', e.target.value)} />
            </motion.div>
        )}
      </AnimatePresence>
      
      {/* --- Other Fields --- */}
      <Select label="Tipo de contato" name="tipo" value={data.tipo || 'cliente'} onChange={(e) => onChange('tipo', e.target.value)} required className="sm:col-span-3">
            <option value="cliente">Cliente</option>
            <option value="fornecedor">Fornecedor</option>
            <option value="ambos">Ambos</option>
      </Select>
      
      <Select label="Contribuinte" name="contribuinte_icms" value={data.contribuinte_icms || '9'} onChange={e => onChange('contribuinte_icms', e.target.value)} required className="sm:col-span-3">
        {contribuinteOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </Select>
      
      <AnimatePresence>
        {tipoPessoa === 'juridica' && (
          <motion.div
            key="inscricoes"
            className="sm:col-span-6 grid grid-cols-1 sm:grid-cols-6 gap-6"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: '1.5rem' }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <Input label="Inscrição Estadual" name="inscr_estadual" value={data.inscr_estadual || ''} onChange={e => onChange('inscr_estadual', e.target.value)} className="sm:col-span-3" />
            <Input label="Inscrição Municipal" name="inscr_municipal" value={data.inscr_municipal || ''} onChange={e => onChange('inscr_municipal', e.target.value)} className="sm:col-span-3" />
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
};

export default IdentificationSection;
