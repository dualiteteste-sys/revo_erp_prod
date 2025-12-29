import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Percent } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { supabase } from '@/lib/supabaseClient';
import { listVendedores, type Vendedor } from '@/services/vendedores';

type VendaComissaoRow = {
  id: string;
  numero: number;
  vendedor_id: string | null;
  comissao_percent: number;
  total_geral: number;
  data_emissao: string;
  status: string;
};

const sb = supabase as any;

export default function ComissoesPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VendaComissaoRow[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [{ data, error }, vend] = await Promise.all([
        sb
          .from('vendas_pedidos')
          .select('id,numero,vendedor_id,comissao_percent,total_geral,data_emissao,status')
          .not('vendedor_id', 'is', null)
          .order('data_emissao', { ascending: false })
          .limit(500),
        listVendedores(undefined, false),
      ]);
      if (error) throw error;
      setRows((data || []) as any);
      setVendedores(vend);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar comissões.', 'error');
      setRows([]);
      setVendedores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendedorById = useMemo(() => {
    const map = new Map<string, Vendedor>();
    for (const v of vendedores) map.set(v.id, v);
    return map;
  }, [vendedores]);

  const resumo = useMemo(() => {
    const map = new Map<string, { vendedor: Vendedor; totalVendas: number; totalComissao: number; pedidos: number }>();
    for (const r of rows) {
      if (!r.vendedor_id) continue;
      const v = vendedorById.get(r.vendedor_id);
      if (!v) continue;
      const total = Number(r.total_geral || 0);
      const pct = Number(r.comissao_percent || 0);
      const com = total * (pct / 100);
      const key = v.id;
      const cur = map.get(key) || { vendedor: v, totalVendas: 0, totalComissao: 0, pedidos: 0 };
      cur.totalVendas += total;
      cur.totalComissao += com;
      cur.pedidos += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalComissao - a.totalComissao);
  }, [rows, vendedorById]);

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Percent className="text-blue-600" /> Comissões
          </h1>
          <p className="text-gray-600 text-sm mt-1">Resumo por vendedor (base: pedidos com `vendedor_id`).</p>
        </div>
        <button onClick={() => load()} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
          Atualizar
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : resumo.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">
            Nenhum pedido com vendedor atribuído ainda.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3">Total em vendas</th>
                  <th className="px-4 py-3">Total comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {resumo.map((r) => (
                  <tr key={r.vendedor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.vendedor.nome}</td>
                    <td className="px-4 py-3">{r.pedidos}</td>
                    <td className="px-4 py-3">{r.totalVendas.toFixed(2)}</td>
                    <td className="px-4 py-3">{r.totalComissao.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

