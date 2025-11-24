import React, { useEffect, useState } from 'react';
import { useExtrato } from '@/hooks/useExtrato';
import { useContasCorrentes } from '@/hooks/useTesouraria';
import { Loader2, Search, FileSpreadsheet, X, Printer, Download } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import ExtratoTable from '@/components/financeiro/extrato/ExtratoTable';
import ExtratoSummaryCards from '@/components/financeiro/extrato/ExtratoSummary';
import Select from '@/components/ui/forms/Select';
import DatePicker from '@/components/ui/DatePicker';
import { useToast } from '@/contexts/ToastProvider';

export default function ExtratoPage() {
  const { contas } = useContasCorrentes();
  const [selectedContaId, setSelectedContaId] = useState<string>('');
  const { addToast } = useToast();

  // Auto-select first account if none selected
  useEffect(() => {
    if (!selectedContaId && contas.length > 0) {
      setSelectedContaId(contas[0].id);
    }
  }, [contas, selectedContaId]);

  const {
    lancamentos,
    summary,
    loading,
    error,
    count,
    page,
    pageSize,
    searchTerm,
    startDate,
    endDate,
    tipoLancamento,
    conciliado,
    setPage,
    setContaCorrenteId,
    setSearchTerm,
    setStartDate,
    setEndDate,
    setTipoLancamento,
    setConciliado,
    refresh,
  } = useExtrato(selectedContaId);

  // Sync local state with hook
  useEffect(() => {
    setContaCorrenteId(selectedContaId || null);
  }, [selectedContaId, setContaCorrenteId]);

  const clearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setTipoLancamento(null);
    setConciliado(null);
    setSearchTerm('');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (lancamentos.length === 0) {
      addToast('Não há dados para exportar.', 'warning');
      return;
    }

    const headers = ['Data', 'Conta', 'Descrição', 'Documento', 'Tipo', 'Valor', 'Saldo', 'Conciliado', 'Vínculo'];
    const csvContent = [
      headers.join(';'),
      ...lancamentos.map(l => [
        new Date(l.data_lancamento).toLocaleDateString('pt-BR'),
        l.conta_nome,
        `"${l.descricao}"`, // Escape quotes
        l.documento_ref || '',
        l.tipo_lancamento === 'credito' ? 'Crédito' : 'Débito',
        l.valor.toFixed(2).replace('.', ','),
        l.saldo_apos_lancamento ? l.saldo_apos_lancamento.toFixed(2).replace('.', ',') : '',
        l.conciliado ? 'Sim' : 'Não',
        l.movimentacao_descricao || ''
      ].join(';'))
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `extrato_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-1">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600" /> Extrato Bancário
          </h1>
          <p className="text-gray-600 text-sm mt-1">Consulta e análise de movimentações bancárias.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={loading || lancamentos.length === 0}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download size={18} />
            Exportar CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Printer size={18} />
            Imprimir
          </button>
        </div>
      </div>

      <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200 print:border-none print:shadow-none print:p-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end print:hidden">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Conta Corrente</label>
            <select
              value={selectedContaId}
              onChange={(e) => setSelectedContaId(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as Contas</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <DatePicker label="De" value={startDate} onChange={setStartDate} className="flex-grow" />
            <DatePicker label="Até" value={endDate} onChange={setEndDate} className="flex-grow" />
          </div>

          <div className="md:col-span-1">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-2.5 pl-10 border border-gray-300 rounded-lg"
                />
             </div>
          </div>
        </div>
        
        <div className="mt-4 flex flex-wrap gap-4 items-center pt-4 border-t border-gray-100 print:hidden">
            <div className="w-40">
                <Select value={tipoLancamento || ''} onChange={e => setTipoLancamento(e.target.value as any || null)}>
                    <option value="">Todos os Tipos</option>
                    <option value="credito">Crédito (Entrada)</option>
                    <option value="debito">Débito (Saída)</option>
                </Select>
            </div>
            <div className="w-40">
                <Select 
                    value={conciliado === null ? '' : String(conciliado)} 
                    onChange={e => setConciliado(e.target.value === '' ? null : e.target.value === 'true')}
                >
                    <option value="">Todos Status</option>
                    <option value="true">Conciliado</option>
                    <option value="false">Pendente</option>
                </Select>
            </div>
            <button 
                onClick={clearFilters} 
                className="text-sm text-gray-500 hover:text-red-600 flex items-center gap-1 ml-auto"
            >
                <X size={14} /> Limpar Filtros
            </button>
        </div>

        {/* Print Header Only */}
        <div className="hidden print:block mb-4">
            <h2 className="text-2xl font-bold">Extrato Bancário</h2>
            <p className="text-gray-600">
                Conta: {contas.find(c => c.id === selectedContaId)?.nome || 'Todas'} | 
                Período: {startDate ? startDate.toLocaleDateString() : 'Início'} até {endDate ? endDate.toLocaleDateString() : 'Hoje'}
            </p>
        </div>
      </div>

      {selectedContaId && <ExtratoSummaryCards summary={summary} />}

      <div className="bg-white rounded-lg shadow overflow-hidden print:shadow-none print:border">
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : error ? (
          <div className="h-96 flex items-center justify-center text-red-500">{error}</div>
        ) : (
          <ExtratoTable lancamentos={lancamentos} />
        )}
      </div>

      <div className="print:hidden">
        {count > pageSize && (
            <Pagination currentPage={page} totalCount={count} pageSize={pageSize} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}
