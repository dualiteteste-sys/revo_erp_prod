import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, Building, AlertTriangle } from 'lucide-react';
import { cnpjMask } from '@/lib/masks';
import { fetchCnpjData } from '@/services/externalApis';
import GlassCard from '@/components/ui/GlassCard';

interface CnpjResult {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
  cnae_fiscal_descricao?: string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
}

const CnpjSearchPage: React.FC = () => {
  const [cnpj, setCnpj] = useState('');
  const [result, setResult] = useState<Partial<CnpjResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCnpj(cnpjMask(e.target.value));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cnpj.replace(/\D/g, '').length !== 14) {
      setError('Por favor, insira um CNPJ válido com 14 dígitos.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await fetchCnpjData(cnpj);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao buscar o CNPJ.');
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
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Consulta de CNPJ</h1>

      <GlassCard className="p-6 md:p-8 max-w-4xl mx-auto">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-4 mb-8">
          <div className="relative w-full sm:flex-grow">
            <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={cnpj}
              onChange={handleCnpjChange}
              placeholder="Digite o CNPJ (somente números)"
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

        <div className="min-h-[300px] flex items-center justify-center">
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

            {result && !loading && !error && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full bg-white/50 p-6 rounded-xl border border-gray-200 space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <ResultItem label="Razão Social" value={result.razao_social} />
                    <ResultItem label="Nome Fantasia" value={result.nome_fantasia} />
                </div>
                <div className="border-t border-gray-200 pt-6 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                    <ResultItem label="Situação Cadastral" value={`${result.descricao_situacao_cadastral} (desde ${result.data_situacao_cadastral})`} />
                    <ResultItem label="Atividade Principal (CNAE)" value={result.cnae_fiscal_descricao} />
                    <ResultItem label="Telefone" value={result.ddd_telefone_1} />
                </div>
                <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-md font-semibold text-gray-600 mb-4">Endereço</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                        <ResultItem label="Logradouro" value={`${result.logradouro}, ${result.numero}`} />
                        <ResultItem label="Bairro" value={result.bairro} />
                        <ResultItem label="CEP" value={result.cep} />
                        <ResultItem label="Município" value={result.municipio} />
                        <ResultItem label="UF" value={result.uf} />
                        <ResultItem label="Complemento" value={result.complemento} />
                    </div>
                </div>
              </motion.div>
            )}

            {!result && !loading && !error && (
                <motion.div
                    key="initial"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-gray-500"
                >
                    <p>Insira um CNPJ para iniciar a consulta.</p>
                </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </div>
  );
};

export default CnpjSearchPage;
