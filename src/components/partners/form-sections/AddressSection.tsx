import React, { useState, useEffect, useCallback } from 'react';
import { EnderecoPayload } from '@/services/partners';
import Section from '../../ui/forms/Section';
import AddressFields from './AddressFields';
import { motion, AnimatePresence } from 'framer-motion';

interface AddressSectionProps {
  enderecos: EnderecoPayload[];
  onEnderecosChange: (updater: (prevEnderecos: EnderecoPayload[]) => EnderecoPayload[]) => void;
}

const AddressSection: React.FC<AddressSectionProps> = ({ enderecos, onEnderecosChange }) => {
  const [hasDifferentBillingAddress, setHasDifferentBillingAddress] = useState(false);

  const primaryAddress = enderecos.find(e => e.tipo_endereco !== 'COBRANCA') || {};
  const billingAddress = enderecos.find(e => e.tipo_endereco === 'COBRANCA') || {};

  useEffect(() => {
    setHasDifferentBillingAddress(!!enderecos.find(e => e.tipo_endereco === 'COBRANCA'));
  }, [enderecos]);

  const handleAddressChange = useCallback((addressType: 'PRINCIPAL' | 'COBRANCA', updates: Partial<EnderecoPayload>) => {
    onEnderecosChange(prevEnderecos => {
      const newEnderecos = [...prevEnderecos];
      let addressIndex = newEnderecos.findIndex(e => e.tipo_endereco === addressType);

      if (addressIndex === -1) {
        newEnderecos.push({ tipo_endereco: addressType, ...updates });
      } else {
        newEnderecos[addressIndex] = { ...newEnderecos[addressIndex], ...updates };
      }
      return newEnderecos;
    });
  }, [onEnderecosChange]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setHasDifferentBillingAddress(isChecked);
    if (!isChecked) {
      onEnderecosChange(prev => prev.filter(e => e.tipo_endereco !== 'COBRANCA'));
    } else {
      onEnderecosChange(prev => {
        if (!prev.find(e => e.tipo_endereco === 'COBRANCA')) {
          return [...prev, { tipo_endereco: 'COBRANCA' }];
        }
        return prev;
      });
    }
  };

  return (
    <Section title="Endereço" description="Endereço principal do parceiro e, opcionalmente, de cobrança.">
      <div className="sm:col-span-6 space-y-6">
        <AddressFields
          address={primaryAddress}
          onAddressChange={(updates) => handleAddressChange('PRINCIPAL', updates)}
          title="Endereço Principal"
        />

        <div className="relative flex items-start">
          <div className="flex h-6 items-center">
            <input
              id="billing-address-checkbox"
              name="billing-address-checkbox"
              type="checkbox"
              checked={hasDifferentBillingAddress}
              onChange={handleCheckboxChange}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
          </div>
          <div className="ml-3 text-sm leading-6">
            <label htmlFor="billing-address-checkbox" className="font-medium text-gray-900">
              Possui endereço de cobrança diferente do endereço principal
            </label>
          </div>
        </div>

        <AnimatePresence>
          {hasDifferentBillingAddress && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <AddressFields
                address={billingAddress}
                onAddressChange={(updates) => handleAddressChange('COBRANCA', updates)}
                title="Endereço de Cobrança"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  );
};

export default AddressSection;
