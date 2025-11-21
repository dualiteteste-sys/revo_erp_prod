import React, { useState } from 'react';
import { EnderecoPayload } from '@/services/partners';
import { Loader2, Search } from 'lucide-react';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { cepMask } from '@/lib/masks';
import { UFS } from '@/lib/constants';
import { fetchCepData } from '@/services/externalApis';

interface AddressFieldsProps {
  address: EnderecoPayload;
  onAddressChange: (updates: Partial<EnderecoPayload>) => void;
  title: string;
}

const AddressFields: React.FC<AddressFieldsProps> = ({ address, onAddressChange, title }) => {
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target as { name: keyof EnderecoPayload; value: string };
    const finalValue = name === 'cep' ? cepMask(value) : value;
    onAddressChange({ [name]: finalValue });
  };

  const handleCepBlur = async () => {
    const cleanedCep = address.cep?.replace(/\D/g, '') || '';
    if (cleanedCep.length !== 8) {
      setCepError(null); // Limpa o erro se o CEP não estiver completo
      return;
    }

    setIsFetchingCep(true);
    setCepError(null);
    try {
      const data = await fetchCepData(cleanedCep);
      onAddressChange({
        logradouro: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        uf: data.uf || '',
      });
    } catch (error: any) {
      setCepError(error.message || 'CEP não encontrado.');
      // Limpa os campos em caso de erro para permitir preenchimento manual
      onAddressChange({
        logradouro: '',
        bairro: '',
        cidade: '',
        uf: '',
      });
    } finally {
      setIsFetchingCep(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50/50 relative">
      <h4 className="font-medium text-gray-700 mb-4">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-6">
        <div className="sm:col-span-2">
          <label htmlFor={`cep-${title}`} className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
          <div className="relative">
            <input
              id={`cep-${title}`}
              name="cep"
              value={address.cep || ''}
              onChange={handleFieldChange}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg pr-10"
            />
            <div className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 pointer-events-none">
              {isFetchingCep ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            </div>
          </div>
          {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
        </div>
        <Input
          label="Município"
          name="cidade"
          value={address.cidade || ''}
          onChange={handleFieldChange}
          className="sm:col-span-3"
          disabled={isFetchingCep}
        />
        <Select
          label="UF"
          name="uf"
          value={address.uf || ''}
          onChange={handleFieldChange}
          className="sm:col-span-1"
          disabled={isFetchingCep}
        >
          <option value="">UF</option>
          {UFS.map(uf => <option key={uf.value} value={uf.value}>{uf.value}</option>)}
        </Select>

        <Input
          label="Endereço"
          name="logradouro"
          value={address.logradouro || ''}
          onChange={handleFieldChange}
          className="sm:col-span-6"
          disabled={isFetchingCep}
        />

        <Input
          label="Bairro"
          name="bairro"
          value={address.bairro || ''}
          onChange={handleFieldChange}
          className="sm:col-span-3"
          disabled={isFetchingCep}
        />
        <Input
          label="Número"
          name="numero"
          value={address.numero || ''}
          onChange={handleFieldChange}
          className="sm:col-span-1"
          disabled={isFetchingCep}
        />
        <Input
          label="Complemento"
          name="complemento"
          value={address.complemento || ''}
          onChange={handleFieldChange}
          className="sm:col-span-2"
          disabled={isFetchingCep}
        />
      </div>
    </div>
  );
};

export default AddressFields;
