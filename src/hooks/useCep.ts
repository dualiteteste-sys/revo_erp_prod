import { useState, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import { fetchCepData, CepData } from '@/services/externalApis';

export const useCep = (cep: string) => {
  const [data, setData] = useState<Partial<CepData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedCep = useDebounce(cep.replace(/\D/g, ''), 500);

  useEffect(() => {
    if (debouncedCep.length !== 8) {
      setData(null);
      setError(null);
      return;
    }

    const searchCep = async () => {
      setLoading(true);
      setError(null);
      try {
        const addressData = await fetchCepData(debouncedCep);
        setData(addressData);
      } catch (err: any) {
        setError(err.message || 'CEP não encontrado.');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    searchCep();
  }, [debouncedCep]);

  return { data, loading, error };
};
