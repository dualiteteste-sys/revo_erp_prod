import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthProvider';
import { Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '../../../contexts/ToastProvider';
import { EmpresaUpdate, updateCompany } from '@/services/company';
import { fetchCnpjData } from '@/services/externalApis';
import LogoUploader from './LogoUploader';
import { documentMask, cepMask, phoneMask } from '@/lib/masks';

type Props = {
  onSaved?: () => void | Promise<void>;
};

const CompanySettingsForm: React.FC<Props> = ({ onSaved }) => {
  const { activeEmpresa, refreshEmpresas } = useAuth();
  const { addToast } = useToast();

  // Extend EmpresaUpdate to include form-specific fields
  interface CompanyFormState extends EmpresaUpdate {
    razao_social?: string;
    fantasia?: string;
  }

  const [formData, setFormData] = useState<CompanyFormState | null>(null);
  const [initialData, setInitialData] = useState<CompanyFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);

  useEffect(() => {
    if (activeEmpresa) {
      const initialFormState: CompanyFormState = {
        ...activeEmpresa,
        razao_social: activeEmpresa.nome_razao_social || '',
        fantasia: (activeEmpresa as any).nome_fantasia || (activeEmpresa as any).fantasia || '',
      };
      setFormData(initialFormState);
      setInitialData(initialFormState);
    }
  }, [activeEmpresa]);

  useEffect(() => {
    if (formData && initialData) {
      const hasChanged = JSON.stringify(formData) !== JSON.stringify(initialData);
      setIsDirty(hasChanged);
    }
  }, [formData, initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let maskedValue = value;
    if (name === 'cnpj') maskedValue = documentMask(value);
    if (name === 'endereco_cep') maskedValue = cepMask(value);
    if (name === 'telefone') maskedValue = phoneMask(value);

    setFormData(prev => (prev ? { ...prev, [name]: maskedValue } : null));
  };

  const handleLogoChange = (newPath: string | null) => {
    setFormData(prev => (prev ? { ...prev, logotipo_url: newPath } : null));
  };

  const handleFetchCnpjData = async () => {
    if (!formData?.cnpj) return;
    setIsFetchingCnpj(true);

    try {
      const data = await fetchCnpjData(formData.cnpj);

      setFormData(prev => ({
        ...prev,
        razao_social: data.razao_social || prev?.razao_social || '',
        fantasia: data.nome_fantasia || prev?.fantasia,
        endereco_cep: data.cep || prev?.endereco_cep,
        endereco_logradouro: data.logradouro || prev?.endereco_logradouro,
        endereco_numero: data.numero || prev?.endereco_numero,
        endereco_complemento: data.complemento || prev?.endereco_complemento,
        endereco_bairro: data.bairro || prev?.endereco_bairro,
        endereco_cidade: data.municipio || prev?.endereco_cidade,
        endereco_uf: data.uf || prev?.endereco_uf,
        telefone: data.ddd_telefone_1 || prev?.telefone,
        email: prev?.email, // Keep existing email
      }));
      addToast('Dados da empresa preenchidos com sucesso!', 'success');

    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    setLoading(true);

    const finalPayload: EmpresaUpdate = {
      nome_razao_social: formData.razao_social?.trim() || null,
      nome_fantasia: formData.fantasia?.trim() || null,
      cnpj: formData.cnpj?.replace(/\D/g, '') || null,
      endereco_cep: formData.endereco_cep?.replace(/\D/g, '') || null,
      endereco_logradouro: formData.endereco_logradouro?.trim() || null,
      endereco_numero: formData.endereco_numero?.trim() || null,
      endereco_complemento: formData.endereco_complemento?.trim() || null,
      endereco_bairro: formData.endereco_bairro?.trim() || null,
      endereco_cidade: formData.endereco_cidade?.trim() || null,
      endereco_uf: formData.endereco_uf?.trim() || null,
      telefone: formData.telefone?.replace(/\D/g, '') || null,
      email: formData.email?.trim() || null,
      logotipo_url: formData.logotipo_url ?? null,
      inscr_estadual: formData.inscr_estadual ?? null,
      inscr_municipal: formData.inscr_municipal ?? null,
    };

    try {
      const updatedCompany = await updateCompany(finalPayload);
      addToast('Dados da empresa atualizados com sucesso!', 'success');

      const fantasiaValue = updatedCompany.nome_fantasia ?? finalPayload.nome_fantasia ?? formData.fantasia ?? '';
      const razaoValue = updatedCompany.nome_razao_social ?? finalPayload.nome_razao_social ?? formData.razao_social ?? '';
      const newFormState: CompanyFormState = {
        ...updatedCompany,
        razao_social: razaoValue,
        fantasia: fantasiaValue,
      };

      setInitialData(newFormState);
      setFormData(newFormState);
      await refreshEmpresas();
      await onSaved?.();
    } catch (error: any) {
      addToast(`Erro ao atualizar empresa: ${error.message}`, 'error');
    }

    setLoading(false);
  };

  const handleReset = () => {
    setFormData(initialData);
  }

  if (!formData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Configurações da Empresa</h1>
        {isDirty && (
          <button
            onClick={handleReset}
            className="text-sm text-gray-600 hover:text-red-600 transition-colors px-3 py-1 rounded-md hover:bg-red-50"
          >
            Descartar alterações
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
          {/* Coluna Esquerda */}
          <div className="space-y-6">
            <LogoUploader logoPath={formData.logotipo_url || null} onLogoChange={handleLogoChange} />
            <InputField label="Razão Social" name="razao_social" value={formData.razao_social || ''} onChange={handleChange} required />
            <InputField label="Nome Fantasia" name="fantasia" value={formData.fantasia || ''} onChange={handleChange} />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="cnpj">CNPJ</label>
              <div className="relative">
                <input
                  id="cnpj" name="cnpj" type="text" value={formData.cnpj || ''} onChange={handleChange}
                  className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm pr-12"
                  placeholder="00.000.000/0001-00"
                />
                <button
                  type="button" onClick={handleFetchCnpjData} disabled={isFetchingCnpj || !formData.cnpj}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                  aria-label="Buscar dados do CNPJ"
                >
                  {isFetchingCnpj ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                </button>
              </div>
            </div>
          </div>

          {/* Coluna Direita */}
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Contato</h2>
              <div className="space-y-6">
                <InputField label="Telefone" name="telefone" value={formData.telefone || ''} onChange={handleChange} />
                <InputField label="Email de Contato" name="email" value={formData.email || ''} onChange={handleChange} type="email" />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Endereço</h2>
              <div className="grid grid-cols-6 gap-6">
                <div className="col-span-6 sm:col-span-2">
                  <InputField label="CEP" name="endereco_cep" value={formData.endereco_cep || ''} onChange={handleChange} />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <InputField label="Logradouro" name="endereco_logradouro" value={formData.endereco_logradouro || ''} onChange={handleChange} />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <InputField label="Número" name="endereco_numero" value={formData.endereco_numero || ''} onChange={handleChange} />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <InputField label="Complemento" name="endereco_complemento" value={formData.endereco_complemento || ''} onChange={handleChange} />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <InputField label="Bairro" name="endereco_bairro" value={formData.endereco_bairro || ''} onChange={handleChange} />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <InputField label="Cidade" name="endereco_cidade" value={formData.endereco_cidade || ''} onChange={handleChange} />
                </div>
                <div className="col-span-6 sm:col-span-1">
                  <InputField label="UF" name="endereco_uf" value={formData.endereco_uf || ''} onChange={handleChange} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            type="submit" disabled={loading || !isDirty}
            className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface InputFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({ label, name, value, onChange, type = 'text', required = false }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={name}>{label}</label>
    <input
      id={name} name={name} type={type} value={value} onChange={onChange} required={required}
      className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
    />
  </div>
);

export default CompanySettingsForm;
