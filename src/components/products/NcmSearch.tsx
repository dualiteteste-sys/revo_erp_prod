import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import NcmSearchModal from './NcmSearchModal';
import axios from 'axios';
import { useDebounce } from '@/hooks/useDebounce';

interface NcmSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const NcmSearch: React.FC<NcmSearchProps> = ({ value, onChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);

  // Debounce value to avoid too many API calls while typing
  const debouncedValue = useDebounce(value, 800);

  const fetchDescription = useCallback(async (ncmCode: string) => {
    const cleanCode = ncmCode.replace(/\D/g, '');
    if (cleanCode.length !== 8) {
      setDescription(null);
      return;
    }

    setIsLoadingDescription(true);
    try {
      // We search for the specific NCM code to get its details
      const response = await axios.get(`https://brasilapi.com.br/api/ncm/v1/${cleanCode}`);
      if (response.data && response.data.descricao) {
        setDescription(response.data.descricao);
      } else {
        setDescription(null);
      }
    } catch (error) {
      console.error("Error fetching NCM description:", error);
      setDescription(null);
    } finally {
      setIsLoadingDescription(false);
    }
  }, []);

  // Effect to auto-fetch description when value changes (e.g. manual typing)
  useEffect(() => {
    if (debouncedValue && !description) {
      fetchDescription(debouncedValue);
    } else if (!debouncedValue) {
      setDescription(null);
    }
  }, [debouncedValue, description, fetchDescription]);

  const handleNcmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    let val = rawValue.replace(/\D/g, '');
    if (val.length > 8) {
      val = val.slice(0, 8);
    }

    let maskedValue = val;
    if (val.length > 4) {
      maskedValue = val.replace(/^(\d{4})/, '$1.');
    }
    if (val.length > 6) {
      maskedValue = maskedValue.replace(/^(\d{4})\.(\d{2})/, '$1.$2.');
    }

    // If user changes value manually, clear description so effect can re-fetch
    if (maskedValue !== value) {
      setDescription(null);
    }
    onChange(maskedValue);
  };

  const handleSelectNcm = (ncm: string, desc: string) => {
    // Ensure we have only digits before formatting
    const cleanNcm = ncm.replace(/\D/g, '');
    let maskedValue = cleanNcm;

    if (cleanNcm.length > 4) {
      maskedValue = cleanNcm.replace(/^(\d{4})/, '$1.');
    }
    if (cleanNcm.length > 6) {
      maskedValue = maskedValue.replace(/^(\d{4})\.(\d{2})/, '$1.$2.');
    }

    setDescription(desc);
    onChange(maskedValue);
  };

  return (
    <>
      <div className="sm:col-span-3">
        <label htmlFor="ncm" className="block text-sm font-medium text-gray-700 mb-1">NCM</label>
        <div className="relative">
          <input
            id="ncm"
            name="ncm"
            value={value || ''}
            onChange={handleNcmChange}
            placeholder="0000.00.00"
            maxLength={10}
            className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm pr-12"
          />
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500 hover:text-blue-600 transition-colors"
            aria-label="Buscar NCM com IA"
          >
            <Sparkles size={20} />
          </button>
        </div>

        {/* Description Display */}
        <div className="mt-2 min-h-[20px]">
          {isLoadingDescription ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              Buscando descrição...
            </div>
          ) : description ? (
            <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
              {description}
            </p>
          ) : null}
        </div>

      </div>
      <NcmSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelectNcm}
      />
    </>
  );
};

export default NcmSearch;
