import React, { useState } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Loader2, Server } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { Empresa } from '@/services/company';

const SupabaseDemoPage: React.FC = () => {
  const supabase = useSupabase();
  const [companies, setCompanies] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    setError(null);
    setCompanies([]);

    try {
      const { data, error: fetchError } = await supabase
        .from('empresas')
        .select('*')
        .limit(5);

      if (fetchError) {
        throw fetchError;
      }

      setCompanies(data);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao buscar os dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-1">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Demonstração do Supabase</h1>
      <GlassCard className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="flex flex-col items-center gap-4 mb-8">
          <p className="text-center text-gray-600">
            Esta página demonstra o uso do hook `useSupabase()` para interagir com o banco de dados.
            Clique no botão abaixo para buscar as 5 primeiras empresas cadastradas.
          </p>
          <button
            onClick={fetchCompanies}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Server />}
            <span>Buscar Empresas</span>
          </button>
        </div>

        <div className="min-h-[200px] bg-white/50 p-4 rounded-xl border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Resultado:</h2>
          {loading && (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-red-600 bg-red-50 p-4 rounded-lg">
              <p className="font-bold">Erro:</p>
              <p>{error}</p>
            </div>
          )}
          {!loading && !error && (
            <pre className="text-sm bg-gray-800 text-white p-4 rounded-lg overflow-auto">
              <code>
                {companies.length > 0
                  ? JSON.stringify(companies, null, 2)
                  : '// Clique no botão para ver os dados aqui.'}
              </code>
            </pre>
          )}
        </div>
      </GlassCard>
    </div>
  );
};

export default SupabaseDemoPage;
