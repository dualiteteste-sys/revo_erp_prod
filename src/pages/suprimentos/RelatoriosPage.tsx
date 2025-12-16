import React, { useState, useEffect } from 'react';
import { 
  getRelatorioValorizacao, 
  getRelatorioBaixoEstoque, 
  RelatorioValorizacaoItem, 
  RelatorioBaixoEstoqueItem 
} from '@/services/suprimentos';
import { Loader2, Search, Download, Printer, TrendingUp, AlertTriangle, BarChart3, CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import ReactECharts from 'echarts-for-react';

type ReportType = 'valorizacao' | 'baixo_estoque';

export default function RelatoriosPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('valorizacao');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const [valorizacaoData, setValorizacaoData] = useState<RelatorioValorizacaoItem[]>([]);
  const [baixoEstoqueData, setBaixoEstoqueData] = useState<RelatorioBaixoEstoqueItem[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeReport === 'valorizacao') {
        const data = await getRelatorioValorizacao(debouncedSearch);
        setValorizacaoData(data);
      } else {
        const data = await getRelatorioBaixoEstoque(debouncedSearch);
        setBaixoEstoqueData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeReport, debouncedSearch]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    let content = '';
    let filename = '';

    if (activeReport === 'valorizacao') {
      const headers = ['Produto', 'SKU', 'Unidade', 'Saldo', 'Custo Médio', 'Valor Total', 'Classe ABC'];
      const rows = valorizacaoData.map(i => [
        `"${i.nome}"`, i.sku || '', i.unidade, i.saldo, 
        i.custo_medio.toFixed(2).replace('.', ','), 
        i.valor_total.toFixed(2).replace('.', ','), 
        i.classe
      ].join(';'));
      content = [headers.join(';'), ...rows].join('\n');
      filename = 'relatorio_valorizacao.csv';
    } else {
      const headers = ['Produto', 'SKU', 'Unidade', 'Saldo', 'Mínimo', 'Máximo', 'Sugestão Compra', 'Fornecedor'];
      const rows = baixoEstoqueData.map(i => [
        `"${i.nome}"`, i.sku || '', i.unidade, i.saldo, 
        i.estoque_min || 0, i.estoque_max || 0, 
        i.sugestao_compra, `"${i.fornecedor_nome || ''}"`
      ].join(';'));
      content = [headers.join(';'), ...rows].join('\n');
      filename = 'relatorio_baixo_estoque.csv';
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
    valorizacaoData.forEach(i => {
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
          <button onClick={handleExport} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors">
            <Download size={18} /> Exportar
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
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
            {activeReport === 'valorizacao' ? 'Relatório de Valorização de Estoque' : 'Relatório de Sugestão de Compras'}
        </h2>
        <p className="text-sm text-gray-500">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
      </div>

      {loading ? (
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
                            {formatCurrency(valorizacaoData.reduce((acc, i) => acc + (i.valor_total * 100), 0))}
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">{valorizacaoData.length} itens com saldo</p>
                    </GlassCard>
                    <GlassCard className="lg:col-span-2 p-2 h-40">
                        <ReactECharts option={getAbcChartOption()} style={{ height: '100%', width: '100%' }} />
                    </GlassCard>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">Produto</th>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500">SKU</th>
                                    <th className="px-4 py-3 text-center font-medium text-gray-500">Un.</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">Saldo</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">Custo Médio</th>
                                    <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
                                    <th className="px-4 py-3 text-center font-medium text-gray-500">Classe ABC</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {valorizacaoData.map((item) => (
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
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Produto</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Saldo Atual</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Mínimo</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Máximo</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500 bg-blue-50">Sugestão Compra</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Fornecedor Principal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {baixoEstoqueData.map((item) => (
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
                            {baixoEstoqueData.length === 0 && (
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
        </div>
      )}
    </div>
  );
}
