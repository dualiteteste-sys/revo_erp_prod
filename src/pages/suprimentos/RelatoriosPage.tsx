import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  getRelatorioValorizacao, 
  getRelatorioBaixoEstoque, 
  getSugestaoCompraMrpLite,
  RelatorioValorizacaoItem, 
  RelatorioBaixoEstoqueItem,
  SugestaoCompraMrpLiteItem,
} from '@/services/suprimentos';
import { Loader2, Search, Download, Printer, TrendingUp, AlertTriangle, BarChart3, CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import ReactECharts from 'echarts-for-react';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { useAuth } from '@/contexts/AuthProvider';

type ReportType = 'valorizacao' | 'baixo_estoque' | 'sugestao_compra';

export default function RelatoriosPage() {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [activeReport, setActiveReport] = useState<ReportType>('valorizacao');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const [valorizacaoData, setValorizacaoData] = useState<RelatorioValorizacaoItem[]>([]);
  const [baixoEstoqueData, setBaixoEstoqueData] = useState<RelatorioBaixoEstoqueItem[]>([]);
  const [sugestaoCompraData, setSugestaoCompraData] = useState<SugestaoCompraMrpLiteItem[]>([]);
  const [valSort, setValSort] = useState<SortState<string>>({ column: 'total', direction: 'desc' });
  const [baixoSort, setBaixoSort] = useState<SortState<string>>({ column: 'saldo', direction: 'asc' });
  const [sugSort, setSugSort] = useState<SortState<string>>({ column: 'sugestao', direction: 'desc' });

  const valColumns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'sku', defaultWidth: 140, minWidth: 120 },
    { id: 'unidade', defaultWidth: 90, minWidth: 80 },
    { id: 'saldo', defaultWidth: 120, minWidth: 100 },
    { id: 'custo_medio', defaultWidth: 160, minWidth: 140 },
    { id: 'total', defaultWidth: 160, minWidth: 140 },
    { id: 'classe', defaultWidth: 120, minWidth: 100 },
  ];
  const baixoColumns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'saldo', defaultWidth: 140, minWidth: 120 },
    { id: 'min', defaultWidth: 120, minWidth: 100 },
    { id: 'max', defaultWidth: 120, minWidth: 100 },
    { id: 'sugestao', defaultWidth: 160, minWidth: 140 },
    { id: 'fornecedor', defaultWidth: 260, minWidth: 180 },
  ];
  const sugColumns: TableColumnWidthDef[] = [
    { id: 'produto', defaultWidth: 360, minWidth: 220 },
    { id: 'saldo', defaultWidth: 120, minWidth: 100 },
    { id: 'em_oc', defaultWidth: 120, minWidth: 100 },
    { id: 'projetado', defaultWidth: 120, minWidth: 100 },
    { id: 'min', defaultWidth: 120, minWidth: 100 },
    { id: 'max', defaultWidth: 120, minWidth: 100 },
    { id: 'sugestao', defaultWidth: 160, minWidth: 140 },
    { id: 'lead_time', defaultWidth: 120, minWidth: 100 },
    { id: 'prev_receb', defaultWidth: 160, minWidth: 140 },
    { id: 'fornecedor', defaultWidth: 240, minWidth: 180 },
  ];

  const { widths: valWidths, startResize: startResizeVal } = useTableColumnWidths({ tableId: 'suprimentos:relatorios:valorizacao', columns: valColumns });
  const { widths: baixoWidths, startResize: startResizeBaixo } = useTableColumnWidths({ tableId: 'suprimentos:relatorios:baixo-estoque', columns: baixoColumns });
  const { widths: sugWidths, startResize: startResizeSug } = useTableColumnWidths({ tableId: 'suprimentos:relatorios:sugestao-compra', columns: sugColumns });

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setValorizacaoData([]);
    setBaixoEstoqueData([]);
    setSugestaoCompraData([]);
    setLoading(!!activeEmpresaId);

    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  const effectiveLoading = !!activeEmpresaId && (loading || empresaChanged);
  const effectiveValorizacaoData = empresaChanged ? [] : valorizacaoData;
  const effectiveBaixoEstoqueData = empresaChanged ? [] : baixoEstoqueData;
  const effectiveSugestaoCompraData = empresaChanged ? [] : sugestaoCompraData;

  const fetchData = useCallback(async () => {
    if (!activeEmpresaId) {
      setValorizacaoData([]);
      setBaixoEstoqueData([]);
      setSugestaoCompraData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (activeReport === 'valorizacao') {
        const data = await getRelatorioValorizacao(debouncedSearch);
        setValorizacaoData(data);
      } else if (activeReport === 'baixo_estoque') {
        const data = await getRelatorioBaixoEstoque(debouncedSearch);
        setBaixoEstoqueData(data);
      } else {
        const data = await getSugestaoCompraMrpLite(debouncedSearch);
        setSugestaoCompraData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, activeReport, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => {
    window.print();
  };

  const sortedValorizacao = useMemo(() => {
    return sortRows(
      effectiveValorizacaoData,
      valSort as any,
      [
        { id: 'produto', type: 'string', getValue: (i) => i.nome ?? '' },
        { id: 'sku', type: 'string', getValue: (i) => i.sku ?? '' },
        { id: 'unidade', type: 'string', getValue: (i) => i.unidade ?? '' },
        { id: 'saldo', type: 'number', getValue: (i) => i.saldo ?? 0 },
        { id: 'custo_medio', type: 'number', getValue: (i) => i.custo_medio ?? 0 },
        { id: 'total', type: 'number', getValue: (i) => i.valor_total ?? 0 },
        { id: 'classe', type: 'string', getValue: (i) => i.classe ?? '' },
      ] as const
    );
  }, [effectiveValorizacaoData, valSort]);

  const sortedBaixoEstoque = useMemo(() => {
    return sortRows(
      effectiveBaixoEstoqueData,
      baixoSort as any,
      [
        { id: 'produto', type: 'string', getValue: (i) => i.nome ?? '' },
        { id: 'saldo', type: 'number', getValue: (i) => i.saldo ?? 0 },
        { id: 'min', type: 'number', getValue: (i) => i.estoque_min ?? 0 },
        { id: 'max', type: 'number', getValue: (i) => i.estoque_max ?? 0 },
        { id: 'sugestao', type: 'number', getValue: (i) => i.sugestao_compra ?? 0 },
        { id: 'fornecedor', type: 'string', getValue: (i) => i.fornecedor_nome ?? '' },
      ] as const
    );
  }, [effectiveBaixoEstoqueData, baixoSort]);

  const sortedSugestaoCompra = useMemo(() => {
    return sortRows(
      effectiveSugestaoCompraData,
      sugSort as any,
      [
        { id: 'produto', type: 'string', getValue: (i) => i.nome ?? '' },
        { id: 'saldo', type: 'number', getValue: (i) => i.saldo ?? 0 },
        { id: 'em_oc', type: 'number', getValue: (i) => i.qtd_em_oc_aberta ?? 0 },
        { id: 'projetado', type: 'number', getValue: (i) => i.saldo_projetado ?? 0 },
        { id: 'min', type: 'number', getValue: (i) => i.estoque_min ?? 0 },
        { id: 'max', type: 'number', getValue: (i) => i.estoque_max ?? 0 },
        { id: 'sugestao', type: 'number', getValue: (i) => i.sugestao_compra ?? 0 },
        { id: 'lead_time', type: 'number', getValue: (i) => i.lead_time_dias ?? 0 },
        { id: 'prev_receb', type: 'date', getValue: (i) => i.data_prevista_recebimento ?? null },
        { id: 'fornecedor', type: 'string', getValue: (i) => i.fornecedor_nome ?? '' },
      ] as const
    );
  }, [sugSort, effectiveSugestaoCompraData]);

  const handleExport = () => {
    let content = '';
    let filename = '';

    if (activeReport === 'valorizacao') {
      const headers = ['Produto', 'SKU', 'Unidade', 'Saldo', 'Custo Médio', 'Valor Total', 'Classe ABC'];
      const rows = effectiveValorizacaoData.map(i => [
        `"${i.nome}"`, i.sku || '', i.unidade, i.saldo, 
        i.custo_medio.toFixed(2).replace('.', ','), 
        i.valor_total.toFixed(2).replace('.', ','), 
        i.classe
      ].join(';'));
      content = [headers.join(';'), ...rows].join('\n');
      filename = 'relatorio_valorizacao.csv';
    } else if (activeReport === 'baixo_estoque') {
      const headers = ['Produto', 'SKU', 'Unidade', 'Saldo', 'Mínimo', 'Máximo', 'Sugestão Compra', 'Fornecedor'];
      const rows = effectiveBaixoEstoqueData.map(i => [
        `"${i.nome}"`, i.sku || '', i.unidade, i.saldo, 
        i.estoque_min || 0, i.estoque_max || 0, 
        i.sugestao_compra, `"${i.fornecedor_nome || ''}"`
      ].join(';'));
      content = [headers.join(';'), ...rows].join('\n');
      filename = 'relatorio_baixo_estoque.csv';
    } else {
      const headers = [
        'Produto',
        'SKU',
        'Unidade',
        'Saldo',
        'Em OC aberta',
        'Saldo projetado',
        'Mínimo',
        'Máximo',
        'Sugestão compra',
        'Lead time (dias)',
        'Prev. recebimento',
        'Fornecedor',
      ];
      const rows = effectiveSugestaoCompraData.map((i) =>
        [
          `"${i.nome}"`,
          i.sku || '',
          i.unidade,
          i.saldo,
          i.qtd_em_oc_aberta,
          i.saldo_projetado,
          i.estoque_min ?? 0,
          i.estoque_max ?? 0,
          i.sugestao_compra,
          i.lead_time_dias,
          i.data_prevista_recebimento ?? '',
          `"${i.fornecedor_nome || ''}"`,
        ].join(';')
      );
      content = [headers.join(';'), ...rows].join('\n');
      filename = 'sugestao_compra_mrp_lite.csv';
    }

    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Chart Options ---
  const getAbcChartOption = () => {
    const counts = { A: 0, B: 0, C: 0 };
    let totalValue = 0;
    effectiveValorizacaoData.forEach(i => {
      counts[i.classe]++;
      totalValue += i.valor_total;
    });

    return {
      tooltip: { trigger: 'item' },
      legend: { top: '5%', left: 'center' },
      series: [
        {
          name: 'Classe ABC',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold' } },
          data: [
            { value: counts.A, name: 'Classe A (80% Valor)', itemStyle: { color: '#3b82f6' } },
            { value: counts.B, name: 'Classe B (15% Valor)', itemStyle: { color: '#10b981' } },
            { value: counts.C, name: 'Classe C (5% Valor)', itemStyle: { color: '#f59e0b' } },
          ]
        }
      ]
    };
  };

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver relatórios de suprimentos.</div>;
  }

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-blue-600" /> Relatórios de Suprimentos
          </h1>
          <p className="text-gray-600 text-sm mt-1">Análise de estoque e planejamento de compras.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={effectiveLoading}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download size={18} /> Exportar
          </button>
          <button
            onClick={handlePrint}
            disabled={effectiveLoading}
            className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Printer size={18} /> Imprimir
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 print:hidden overflow-x-auto pb-2">
        <button
          onClick={() => setActiveReport('valorizacao')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
            activeReport === 'valorizacao' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <TrendingUp size={18} /> Valorização & Curva ABC
        </button>
        <button
          onClick={() => setActiveReport('baixo_estoque')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
            activeReport === 'baixo_estoque' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <AlertTriangle size={18} /> Baixo Estoque / Reposição
        </button>
        <button
          onClick={() => setActiveReport('sugestao_compra')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
            activeReport === 'sugestao_compra' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <AlertTriangle size={18} /> Sugestão de Compra (MRP-lite)
        </button>
      </div>

      <div className="mb-6 print:hidden">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Filtrar por produto ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Header for Print */}
      <div className="hidden print:block mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {activeReport === 'valorizacao'
            ? 'Relatório de Valorização de Estoque'
            : activeReport === 'baixo_estoque'
              ? 'Relatório de Baixo Estoque / Reposição'
              : 'Relatório de Sugestão de Compra (MRP-lite)'}
        </h2>
        <p className="text-sm text-gray-500">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
      </div>

      {effectiveLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
        </div>
      ) : (
        <div className="space-y-6">
          {activeReport === 'valorizacao' && (
            <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
                        <GlassCard className="p-6 flex flex-col justify-center">
                            <p className="text-gray-500 font-medium">Valor Total em Estoque</p>
                            <h3 className="text-3xl font-bold text-blue-800 mt-2">
                            {formatCurrency(effectiveValorizacaoData.reduce((acc, i) => acc + (i.valor_total * 100), 0))}
                            </h3>
                        <p className="text-sm text-gray-400 mt-1">{effectiveValorizacaoData.length} itens com saldo</p>
                    </GlassCard>
                    <GlassCard className="lg:col-span-2 p-2 h-40">
                        <ReactECharts option={getAbcChartOption()} style={{ height: '100%', width: '100%' }} />
                    </GlassCard>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <TableColGroup columns={valColumns} widths={valWidths} />
                            <thead className="bg-gray-50">
                                <tr>
                                    <ResizableSortableTh columnId="produto" label="Produto" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                    <ResizableSortableTh columnId="sku" label="SKU" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                    <ResizableSortableTh columnId="unidade" label="Un." align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                    <ResizableSortableTh columnId="saldo" label="Saldo" align="right" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                    <ResizableSortableTh columnId="custo_medio" label="Custo Médio" align="right" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                    <ResizableSortableTh columnId="total" label="Total" align="right" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                    <ResizableSortableTh columnId="classe" label="Classe ABC" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={valSort as any} onSort={(col) => setValSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeVal as any} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedValorizacao.map((item) => (
                                    <tr key={item.produto_id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-900">{item.nome}</td>
                                        <td className="px-4 py-2 text-gray-500">{item.sku || '-'}</td>
                                        <td className="px-4 py-2 text-center text-gray-500">{item.unidade}</td>
                                        <td className="px-4 py-2 text-right">{item.saldo}</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(item.custo_medio * 100)}</td>
                                        <td className="px-4 py-2 text-right font-bold text-gray-800">{formatCurrency(item.valor_total * 100)}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                item.classe === 'A' ? 'bg-blue-100 text-blue-800' :
                                                item.classe === 'B' ? 'bg-green-100 text-green-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {item.classe}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
          )}

          {activeReport === 'baixo_estoque' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <TableColGroup columns={baixoColumns} widths={baixoWidths} />
                        <thead className="bg-gray-50">
                            <tr>
                                <ResizableSortableTh columnId="produto" label="Produto" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={baixoSort as any} onSort={(col) => setBaixoSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeBaixo as any} />
                                <ResizableSortableTh columnId="saldo" label="Saldo Atual" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={baixoSort as any} onSort={(col) => setBaixoSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeBaixo as any} />
                                <ResizableSortableTh columnId="min" label="Mínimo" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={baixoSort as any} onSort={(col) => setBaixoSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeBaixo as any} />
                                <ResizableSortableTh columnId="max" label="Máximo" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={baixoSort as any} onSort={(col) => setBaixoSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeBaixo as any} />
                                <ResizableSortableTh columnId="sugestao" label="Sugestão Compra" align="center" className="px-4 py-3 font-medium text-gray-500 bg-blue-50 normal-case tracking-normal" sort={baixoSort as any} onSort={(col) => setBaixoSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeBaixo as any} />
                                <ResizableSortableTh columnId="fornecedor" label="Fornecedor Principal" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={baixoSort as any} onSort={(col) => setBaixoSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeBaixo as any} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {sortedBaixoEstoque.map((item) => (
                                <tr key={item.produto_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-900">
                                        {item.nome}
                                        <div className="text-xs text-gray-400">{item.sku}</div>
                                    </td>
                                    <td className="px-4 py-2 text-center font-bold text-red-600">{item.saldo}</td>
                                    <td className="px-4 py-2 text-center text-gray-500">{item.estoque_min || '-'}</td>
                                    <td className="px-4 py-2 text-center text-gray-500">{item.estoque_max || '-'}</td>
                                    <td className="px-4 py-2 text-center bg-blue-50 font-bold text-blue-700">
                                        {Math.ceil(item.sugestao_compra)} {item.unidade}
                                    </td>
                                    <td className="px-4 py-2 text-gray-600">{item.fornecedor_nome || '-'}</td>
                                </tr>
                            ))}
                            {effectiveBaixoEstoqueData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">
                                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                                        Nenhum produto com estoque crítico no momento.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
          )}

          {activeReport === 'sugestao_compra' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <TableColGroup columns={sugColumns} widths={sugWidths} />
                  <thead className="bg-gray-50">
                    <tr>
                      <ResizableSortableTh columnId="produto" label="Produto" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="saldo" label="Saldo" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="em_oc" label="Em OC" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="projetado" label="Proj." align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="min" label="Mín." align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="max" label="Máx." align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="sugestao" label="Sugestão" align="center" className="px-4 py-3 font-medium text-gray-500 bg-blue-50 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="lead_time" label="Lead time" align="center" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="prev_receb" label="Prev. receb." className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                      <ResizableSortableTh columnId="fornecedor" label="Fornecedor" className="px-4 py-3 font-medium text-gray-500 normal-case tracking-normal" sort={sugSort as any} onSort={(col) => setSugSort((prev) => toggleSort(prev as any, col))} onResizeStart={startResizeSug as any} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedSugestaoCompra.map((item) => (
                      <tr key={item.produto_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {item.nome}
                          <div className="text-xs text-gray-400">{item.sku}</div>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-700">{item.saldo}</td>
                        <td className="px-4 py-2 text-center text-gray-700">{item.qtd_em_oc_aberta}</td>
                        <td className="px-4 py-2 text-center font-bold text-gray-900">{item.saldo_projetado}</td>
                        <td className="px-4 py-2 text-center text-gray-500">{item.estoque_min ?? '-'}</td>
                        <td className="px-4 py-2 text-center text-gray-500">{item.estoque_max ?? '-'}</td>
                        <td className="px-4 py-2 text-center bg-blue-50 font-bold text-blue-700">
                          {Math.ceil(item.sugestao_compra)} {item.unidade}
                        </td>
                        <td className="px-4 py-2 text-center text-gray-600">{item.lead_time_dias}d</td>
                        <td className="px-4 py-2 text-gray-600">{item.data_prevista_recebimento ?? '-'}</td>
                        <td className="px-4 py-2 text-gray-600">{item.fornecedor_nome || '-'}</td>
                      </tr>
                    ))}
                    {effectiveSugestaoCompraData.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-gray-500">
                          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                          Nenhuma sugestão de compra no momento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
