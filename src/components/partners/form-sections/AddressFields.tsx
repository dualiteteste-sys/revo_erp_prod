import React, { useState } from 'react';
import { EnderecoPayload } from '@/services/partners';
import { Loader2, Search } from 'lucide-react';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { cepMask } from '@/lib/masks';
import { UFS } from '@/lib/constants';
import { fetchCepData, fetchMunicipiosByUf } from '@/services/externalApis';
import FiscalCountryCodeAutocomplete from '@/components/common/FiscalCountryCodeAutocomplete';

interface AddressFieldsProps {
  address: EnderecoPayload;
  onAddressChange: (updates: Partial<EnderecoPayload>) => void;
  title: string;
}

const AddressFields: React.FC<AddressFieldsProps> = ({ address, onAddressChange, title }) => {
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [isFetchingIbge, setIsFetchingIbge] = useState(false);
  const [ibgeError, setIbgeError] = useState<string | null>(null);

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target as { name: keyof EnderecoPayload; value: string };
    const finalValue = name === 'cep' ? cepMask(value) : value;
    onAddressChange({ [name]: finalValue });
  };

  const handleCepBlur = async () => {
    const cleanedCep = address.cep?.replace(/\D/g, '') || '';
    if (cleanedCep.length !== 8) {
      setCepError(null);
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
        cidade_codigo: data.ibge ? String(data.ibge).replace(/\D/g, '') : address.cidade_codigo || '',
        pais: address.pais || 'Brasil',
        pais_codigo: (address.pais_codigo || '1058').replace(/\D/g, ''),
      });
    } catch (error: any) {
      setCepError(error.message || 'CEP não encontrado.');
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

  const handleBuscarIbge = async () => {
    const uf = String(address.uf || '').trim().toUpperCase();
    const cidade = String(address.cidade || '').trim();
    if (!uf || !cidade) return;
    setIsFetchingIbge(true);
    setIbgeError(null);
    try {
      const municipios = await fetchMunicipiosByUf(uf);
      const normalize = (s: string) =>
        s
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      const target = normalize(cidade);

      const exact = municipios.find((m) => normalize(m.nome) === target);
      const loose = municipios.find((m) => normalize(m.nome).includes(target) || target.includes(normalize(m.nome)));
      const chosen = exact ?? loose ?? null;
      if (!chosen) {
        setIbgeError('Não foi possível localizar o código IBGE para este município.');
        return;
      }
      onAddressChange({ cidade_codigo: chosen.codigo_ibge });
    } catch (e: any) {
      setIbgeError(e?.message || 'Falha ao buscar municípios.');
    } finally {
      setIsFetchingIbge(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50/50 relative">
      <h4 className="font-medium text-gray-700 mb-4">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-6">
        <div className="sm:col-span-2">
          <label htmlFor={`cep-${title}`} className="block text-sm font-medium text-gray-700 mb-1">
            CEP
          </label>
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
          {UFS.map((uf) => (
            <option key={uf.value} value={uf.value}>
              {uf.value}
            </option>
          ))}
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

        <Input
          label="Código município (IBGE)"
          name="cidade_codigo"
          value={address.cidade_codigo || ''}
          onChange={handleFieldChange}
          className="sm:col-span-3"
          placeholder="Ex.: 3550308"
          disabled={isFetchingCep}
          helperText={
            ibgeError ? (
              <span className="text-red-500">{ibgeError}</span>
            ) : (
              'Preenchido automaticamente via CNPJ/CEP quando disponível.'
            )
          }
        />

        <div className="sm:col-span-3 flex items-end">
          <button
            type="button"
            className="h-11 px-3 rounded-lg border border-gray-300 bg-white/80 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleBuscarIbge}
            disabled={isFetchingCep || isFetchingIbge || !address.uf || !address.cidade}
            title="Buscar automaticamente o código do município (IBGE) a partir de UF + Município"
          >
            {isFetchingIbge ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Buscando IBGE...
              </span>
            ) : (
              'Buscar código IBGE'
            )}
          </button>
        </div>

        <div className="sm:col-span-3">
          <label htmlFor={`pais-${title}`} className="mb-1 block text-sm font-medium text-gray-700">
            Código país
          </label>
          <FiscalCountryCodeAutocomplete
            value={address.pais_codigo || ''}
            onChange={(codigo, hit) => {
              onAddressChange({
                pais_codigo: codigo || '',
                pais: hit?.nome ? hit.nome : address.pais || '',
              });
            }}
            disabled={isFetchingCep}
          />
          <p className="mt-1 text-xs text-gray-500">Padrão: Brasil (1058). Digite o nome do país ou o código.</p>
        </div>
      </div>
    </div>
  );
};

export default AddressFields;
