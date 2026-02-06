import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Percent, Search } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { listVendedores, type Vendedor } from '@/services/vendedores';
import { listVendasComissoes } from '@/services/vendasReadModels';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import Input from '@/components/ui/forms/Input';
import { useAuth } from '@/contexts/AuthProvider';

type VendaComissaoRow = {
  id: string;
  numero: number;
  vendedor_id: string | null;
  comissao_percent: number;
  total_geral: number;
  data_emissao: string;
  status: string;
};

function formatMoneyBRL(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (s: string) => `"${String(s ?? '').split('"').join('""')}"`;
  const csv = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ComissoesPage() {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VendaComissaoRow[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'orcamento' | 'aprovado' | 'concluido' | 'cancelado'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [resumoSort, setResumoSort] = useState<SortState<string>>({ column: 'total_comissao', direction: 'desc' });
  const [detailsSort, setDetailsSort] = useState<SortState<string>>({ column: 'data', direction: 'desc' });

  const resumoColumns: TableColumnWidthDef[] = [
    { id: 'vendedor', defaultWidth: 320, minWidth: 220 },
    { id: 'pedidos', defaultWidth: 140, minWidth: 120 },
    { id: 'total_vendas', defaultWidth: 180, minWidth: 160 },
    { id: 'total_comissao', defaultWidth: 180, minWidth: 160 },
  ];
  const detailsColumns: TableColumnWidthDef[] = [
    { id: 'pedido', defaultWidth: 120, minWidth: 100 },
    { id: 'data', defaultWidth: 150, minWidth: 140 },
    { id: 'vendedor', defaultWidth: 260, minWidth: 200 },
    { id: 'status', defaultWidth: 140, minWidth: 120 },
    { id: 'percent', defaultWidth: 110, minWidth: 100 },
    { id: 'total', defaultWidth: 160, minWidth: 140 },
    { id: 'comissao', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths: resumoWidths, startResize: startResizeResumo } = useTableColumnWidths({ tableId: 'vendas:comissoes:resumo', columns: resumoColumns });
  const { widths: detailsWidths, startResize: startResizeDetails } = useTableColumnWidths({ tableId: 'vendas:comissoes:detalhes', columns: detailsColumns });

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const fetchTokenRef = useRef(0);

  useEffect(() => {
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  async function load() {
    if (!activeEmpresaId) {
      setRows([]);
      setVendedores([]);
      setLoading(false);
      return;
    }

    const token = ++fetchTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setLoading(true);
    try {
      const [data, vend] = await Promise.all([listVendasComissoes({ limit: 500 }), listVendedores(undefined, false)]);
      if (token !== fetchTokenRef.current) return;
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      setRows((data || []) as any);
      setVendedores(vend);
    } catch (e: any) {
      if (token !== fetchTokenRef.current) return;
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message || 'Falha ao carregar comissões.', 'error');
      setRows([]);
      setVendedores([]);
    } finally {
      if (token !== fetchTokenRef.current) return;
      if (empresaSnapshot !== lastEmpresaIdRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setRows([]);
    setVendedores([]);
    if (!activeEmpresaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [activeEmpresaId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId]);

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveRows = empresaChanged ? [] : rows;

  const vendedorById = useMemo(() => {
    const map = new Map<string, Vendedor>();
    for (const v of vendedores) map.set(v.id, v);
    return map;
  }, [vendedores]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effectiveRows.filter((r) => {
      if (vendedorFilter !== 'all' && r.vendedor_id !== vendedorFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (startDate && String(r.data_emissao) < startDate) return false;
      if (endDate && String(r.data_emissao) > endDate) return false;
      if (!q) return true;
      const vendedorNome = r.vendedor_id ? (vendedorById.get(r.vendedor_id)?.nome || '') : '';
      return `${r.numero} ${vendedorNome}`.toLowerCase().includes(q);
    });
  }, [effectiveRows, search, vendedorFilter, statusFilter, startDate, endDate, vendedorById]);

  const resumo = useMemo(() => {
    const map = new Map<string, { vendedor: Vendedor; totalVendas: number; totalComissao: number; pedidos: number }>();
    for (const r of filteredRows) {
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
  }, [filteredRows, vendedorById]);

  const sortedResumo = useMemo(() => {
    return sortRows(
      resumo,
      resumoSort as any,
      [
        { id: 'vendedor', type: 'string', getValue: (r) => r.vendedor.nome ?? '' },
        { id: 'pedidos', type: 'number', getValue: (r) => r.pedidos ?? 0 },
        { id: 'total_vendas', type: 'number', getValue: (r) => r.totalVendas ?? 0 },
        { id: 'total_comissao', type: 'number', getValue: (r) => r.totalComissao ?? 0 },
      ] as const
    );
  }, [resumo, resumoSort]);

  const sortedDetails = useMemo(() => {
    return sortRows(
      filteredRows,
      detailsSort as any,
      [
        { id: 'pedido', type: 'number', getValue: (r) => r.numero ?? 0 },
        { id: 'data', type: 'date', getValue: (r) => r.data_emissao ?? null },
        { id: 'vendedor', type: 'string', getValue: (r) => (r.vendedor_id ? (vendedorById.get(r.vendedor_id)?.nome ?? '') : '') },
        { id: 'status', type: 'string', getValue: (r) => r.status ?? '' },
        { id: 'percent', type: 'number', getValue: (r) => r.comissao_percent ?? 0 },
        { id: 'total', type: 'number', getValue: (r) => r.total_geral ?? 0 },
        {
          id: 'comissao',
          type: 'number',
          getValue: (r) => Number(r.total_geral || 0) * (Number(r.comissao_percent || 0) / 100),
        },
      ] as const
    );
  }, [detailsSort, filteredRows, vendedorById]);

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver comissões.</div>;
  }

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Percent className="text-blue-600" /> Comissões
          </h1>
          <p className="text-gray-600 text-sm mt-1">Resumo por vendedor (base: pedidos com `vendedor_id`).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
            Atualizar
          </button>
          <button
            onClick={() => {
              const headers = ['Vendedor', 'Pedidos', 'Total Vendas', 'Total Comissão'];
              const csvRows = resumo.map((r) => [
                r.vendedor.nome,
                String(r.pedidos),
                formatMoneyBRL(r.totalVendas),
                formatMoneyBRL(r.totalComissao),
              ]);
              downloadCsv(`comissoes-resumo-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
              addToast('CSV gerado.', 'success');
            }}
            disabled={loading || resumo.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <Download size={16} /> Exportar resumo CSV
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-4 flex-shrink-0 flex-wrap">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nº pedido ou vendedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2.5 pl-9 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={vendedorFilter}
          onChange={(e) => setVendedorFilter(e.target.value)}
          className="p-2.5 border border-gray-300 rounded-xl min-w-[220px]"
        >
          <option value="all">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="p-2.5 border border-gray-300 rounded-xl min-w-[180px]"
        >
          <option value="all">Todos os status</option>
          <option value="orcamento">Orçamento</option>
          <option value="aprovado">Aprovado</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <div className="flex items-center gap-2">
          <Input
            label="De"
            name="startDate"
            type="date"
            size="sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[200px]"
          />
          <Input
            label="Até"
            name="endDate"
            type="date"
            size="sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {effectiveLoading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : resumo.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">
            {effectiveRows.length === 0 ? 'Nenhum pedido com vendedor atribuído ainda.' : 'Nenhum resultado para os filtros.'}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <TableColGroup columns={resumoColumns} widths={resumoWidths} />
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <ResizableSortableTh
                    columnId="vendedor"
                    label="Vendedor"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={resumoSort as any}
                    onSort={(col) => setResumoSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeResumo as any}
                  />
                  <ResizableSortableTh
                    columnId="pedidos"
                    label="Pedidos"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={resumoSort as any}
                    onSort={(col) => setResumoSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeResumo as any}
                  />
                  <ResizableSortableTh
                    columnId="total_vendas"
                    label="Total em vendas"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={resumoSort as any}
                    onSort={(col) => setResumoSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeResumo as any}
                  />
                  <ResizableSortableTh
                    columnId="total_comissao"
                    label="Total comissão"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={resumoSort as any}
                    onSort={(col) => setResumoSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeResumo as any}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedResumo.map((r) => (
                  <tr key={r.vendedor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.vendedor.nome}</td>
                    <td className="px-4 py-3">{r.pedidos}</td>
                    <td className="px-4 py-3">{formatMoneyBRL(r.totalVendas)}</td>
                    <td className="px-4 py-3">{formatMoneyBRL(r.totalComissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 bg-white rounded-lg shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-gray-800 text-sm">Pedidos (detalhes)</div>
          <button
            onClick={() => {
              const headers = ['Pedido', 'Data', 'Vendedor', 'Status', 'Comissão %', 'Total', 'Comissão R$'];
              const csvRows = filteredRows.map((r) => {
                const vendedorNome = r.vendedor_id ? (vendedorById.get(r.vendedor_id)?.nome || '') : '';
                const total = Number(r.total_geral || 0);
                const pct = Number(r.comissao_percent || 0);
                const com = total * (pct / 100);
                return [String(r.numero), String(r.data_emissao), vendedorNome, r.status, String(pct), formatMoneyBRL(total), formatMoneyBRL(com)];
              });
              downloadCsv(`comissoes-pedidos-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
              addToast('CSV gerado.', 'success');
            }}
            disabled={loading || filteredRows.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-sm"
          >
            <Download size={16} /> Exportar pedidos CSV
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center h-40 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex justify-center h-40 items-center text-gray-500">Nada para exibir.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <TableColGroup columns={detailsColumns} widths={detailsWidths} />
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <ResizableSortableTh
                    columnId="pedido"
                    label="Pedido"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                  <ResizableSortableTh
                    columnId="data"
                    label="Data"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                  <ResizableSortableTh
                    columnId="vendedor"
                    label="Vendedor"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                  <ResizableSortableTh
                    columnId="status"
                    label="Status"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                  <ResizableSortableTh
                    columnId="percent"
                    label="%"
                    align="right"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                  <ResizableSortableTh
                    columnId="total"
                    label="Total"
                    align="right"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                  <ResizableSortableTh
                    columnId="comissao"
                    label="Comissão"
                    align="right"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={detailsSort as any}
                    onSort={(col) => setDetailsSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResizeDetails as any}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedDetails.slice(0, 300).map((r) => {
                  const vendedorNome = r.vendedor_id ? (vendedorById.get(r.vendedor_id)?.nome || '') : '';
                  const total = Number(r.total_geral || 0);
                  const pct = Number(r.comissao_percent || 0);
                  const com = total * (pct / 100);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">#{r.numero}</td>
                      <td className="px-4 py-3">{r.data_emissao}</td>
                      <td className="px-4 py-3">{vendedorNome || '-'}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3 text-right">{pct.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{formatMoneyBRL(total)}</td>
                      <td className="px-4 py-3 text-right">{formatMoneyBRL(com)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredRows.length > 300 ? (
              <div className="px-4 py-3 text-xs text-gray-500 border-t">Mostrando 300 primeiros registros (export CSV contém todos).</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
