import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import NcmSearchModal from './NcmSearchModal';

interface NcmSearchProps {
  value: string;
  onChange: (value: string) => void;
}

const NcmSearch: React.FC<NcmSearchProps> = ({ value, onChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    
    onChange(maskedValue);
  };

  const handleSelectNcm = (ncm: string) => {
    let maskedValue = ncm;
    if (ncm.length > 4) {
      maskedValue = ncm.replace(/^(\d{4})/, '$1.');
    }
    if (ncm.length > 6) {
      maskedValue = maskedValue.replace(/^(\d{4})\.(\d{2})/, '$1.$2.');
    }
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
