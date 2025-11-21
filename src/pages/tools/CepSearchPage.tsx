import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, MapPin, AlertTriangle } from 'lucide-react';
import { cepMask } from '@/lib/masks';
import { fetchCepData } from '@/services/externalApis';
import GlassCard from '@/components/ui/GlassCard';

interface Address {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  ddd: string;
}

const CepSearchPage: React.FC = () => {
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState<Partial<Address> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCep(cepMask(e.target.value));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cep.replace(/\D/g, '').length !== 8) {
      setError('Por favor, insira um CEP válido com 8 dígitos.');
      setAddress(null);
      return;
    }

    setLoading(true);
    setError(null);
    setAddress(null);

    try {
      const data = await fetchCepData(cep);
      setAddress(data);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao buscar o CEP.');
    } finally {
      setLoading(false);
    }
  };

  const ResultItem: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    value ? (
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-800">{value}</p>
      </div>
    ) : null
  );

  return (
    <div className="p-1">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Consulta de Endereço por CEP</h1>

      <GlassCard className="p-6 md:p-8 max-w-3xl mx-auto">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-4 mb-8">
          <div className="relative w-full sm:flex-grow">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={cep}
              onChange={handleCepChange}
              placeholder="Digite o CEP (somente números)"
              className="w-full p-4 pl-12 text-lg border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-4 px-8 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            <span>Buscar</span>
          </button>
        </form>

        <div className="min-h-[200px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              </motion.div>
            )}

            {error && !loading && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center text-red-600 flex flex-col items-center gap-2"
              >
                <AlertTriangle size={32} />
                <p>{error}</p>
              </motion.div>
            )}

            {address && !loading && !error && (
              <motion.div
                key="address"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full bg-white/50 p-6 rounded-xl border border-gray-200"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ResultItem label="Logradouro" value={address.logradouro} />
                  </div>
                  <ResultItem label="Bairro" value={address.bairro} />
                  <ResultItem label="Cidade" value={address.localidade} />
                  <ResultItem label="Estado (UF)" value={address.uf} />
                  <ResultItem label="DDD" value={address.ddd} />
                  <ResultItem label="IBGE" value={address.ibge} />
                  {address.complemento && <div className="sm:col-span-2 lg:col-span-3"><ResultItem label="Complemento" value={address.complemento} /></div>}
                </div>
              </motion.div>
            )}

            {!address && !loading && !error && (
                <motion.div
                    key="initial"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-gray-500"
                >
                    <p>Insira um CEP para iniciar a consulta.</p>
                </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  );
};

export default CepSearchPage;
