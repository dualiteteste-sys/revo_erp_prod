import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { listVendas, type VendaPedido } from '@/services/vendas';
import { getRelatoriosVendasTotais } from '@/services/vendasReadModels';
import { useAuth } from '@/contexts/AuthProvider';

type Totais = {
  pedidos: number;
  total: number;
  orcamentos: number;
  aprovados: number;
  concluidos: number;
  cancelados: number;
  pdvTotal: number;
  devolucoesTotal: number;
};

export default function RelatoriosVendasPage() {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<VendaPedido[]>([]);
  const [pdvTotal, setPdvTotal] = useState(0);
  const [devolucoesTotal, setDevolucoesTotal] = useState(0);

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;

  useEffect(() => {
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  useEffect(() => {
    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setOrders([]);
    setPdvTotal(0);
    setDevolucoesTotal(0);

    if (!activeEmpresaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [activeEmpresaId]);

  const load = useCallback(async () => {
    if (!activeEmpresaId) {
      setOrders([]);
      setPdvTotal(0);
      setDevolucoesTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [all, totals] = await Promise.all([listVendas({ search: '', status: undefined, limit: 500, offset: 0 }), getRelatoriosVendasTotais()]);
      setOrders(all);
      setPdvTotal(totals.pdvTotal);
      setDevolucoesTotal(totals.devolucoesTotal);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar relatórios.', 'error');
      setOrders([]);
      setPdvTotal(0);
      setDevolucoesTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);

  const totais: Totais = useMemo(() => {
    const t: Totais = {
      pedidos: orders.length,
      total: 0,
      orcamentos: 0,
      aprovados: 0,
      concluidos: 0,
      cancelados: 0,
      pdvTotal,
      devolucoesTotal,
    };
    for (const o of orders) {
      t.total += Number(o.total_geral || 0);
      if (o.status === 'orcamento') t.orcamentos += 1;
      if (o.status === 'aprovado') t.aprovados += 1;
      if (o.status === 'concluido') t.concluidos += 1;
      if (o.status === 'cancelado') t.cancelados += 1;
    }
    return t;
  }, [orders, pdvTotal, devolucoesTotal]);

  const cards = [
    { label: 'Pedidos (todos)', value: String(totais.pedidos) },
    { label: 'Total vendido (ERP)', value: totais.total.toFixed(2) },
    { label: 'PDV (total)', value: totais.pdvTotal.toFixed(2) },
    { label: 'Devoluções (total)', value: totais.devolucoesTotal.toFixed(2) },
    { label: 'Orçamentos', value: String(totais.orcamentos) },
    { label: 'Concluídos', value: String(totais.concluidos) },
  ];

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart2 className="text-blue-600" /> Relatórios (Vendas)
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: cards com totais e contagem por status.</p>
        </div>
        <button onClick={() => load()} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
          Atualizar
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 flex-grow">
        {!activeEmpresaId ? (
          <div className="flex justify-center h-64 items-center text-gray-600">
            Selecione uma empresa para ver os relatórios.
          </div>
        ) : effectiveLoading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-xl border border-gray-200 p-4">
                <div className="text-sm text-gray-600">{c.label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{c.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
