import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Search, FileText, CheckSquare, AlertTriangle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Select from '@/components/ui/forms/Select';
import Input from '@/components/ui/forms/Input';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import NaturezaOperacaoAutocomplete from '@/components/common/NaturezaOperacaoAutocomplete';
import TableColGroup from '@/components/ui/table/TableColGroup';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { useToast } from '@/contexts/ToastProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { formatOrderNumber, formatCurrency } from '@/lib/utils';
import {
  listarEntregasElegiveis,
  comporNfeBeneficiamento,
  type EntregaElegivel,
  type ComporNfeItem,
} from '@/services/industriaFaturamento';

type SelectedItem = {
  entrega_id: string;
  quantidade: number;
  preco_unitario: number;
};

export default function FaturamentoBeneficiamentoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();

  // Filtros
  const [clienteId, setClienteId] = useState<string | null>(searchParams.get('cliente') || null);
  const [clienteNome, setClienteNome] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Dados
  const [loading, setLoading] = useState(true);
  const [entregas, setEntregas] = useState<EntregaElegivel[]>([]);

  // Seleção
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());

  // Composição
  const [naturezaId, setNaturezaId] = useState<string | null>(null);
  const [naturezaNome, setNaturezaNome] = useState('');
  const [ambiente, setAmbiente] = useState('homologacao');
  const [submitting, setSubmitting] = useState(false);

  // Table columns
  const columns: TableColumnWidthDef[] = [
    { id: 'check', defaultWidth: 50, minWidth: 50, resizable: false },
    { id: 'ob', defaultWidth: 100, minWidth: 90 },
    { id: 'codigo', defaultWidth: 130, minWidth: 100 },
    { id: 'produto', defaultWidth: 250, minWidth: 180 },
    { id: 'cliente', defaultWidth: 200, minWidth: 160 },
    { id: 'data', defaultWidth: 120, minWidth: 110 },
    { id: 'qtdDisp', defaultWidth: 130, minWidth: 110 },
    { id: 'preco', defaultWidth: 140, minWidth: 120 },
    { id: 'total', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'industria:faturamento-benef', columns });

  // Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarEntregasElegiveis({
        clienteId: clienteId || null,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        search: debouncedSearch || null,
      });
      setEntregas(data || []);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar entregas elegíveis.', 'error');
    } finally {
      setLoading(false);
    }
  }, [clienteId, dataInicio, dataFim, debouncedSearch, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Seleção helpers
  const toggleSelect = (e: EntregaElegivel) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(e.entrega_id)) {
        next.delete(e.entrega_id);
      } else {
        next.set(e.entrega_id, {
          entrega_id: e.entrega_id,
          quantidade: e.quantidade_disponivel,
          preco_unitario: e.produto_preco_venda,
        });
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === entregas.length && entregas.length > 0) {
      setSelected(new Map());
    } else {
      const next = new Map<string, SelectedItem>();
      entregas.forEach(e => {
        next.set(e.entrega_id, {
          entrega_id: e.entrega_id,
          quantidade: e.quantidade_disponivel,
          preco_unitario: e.produto_preco_venda,
        });
      });
      setSelected(next);
    }
  };

  const updateSelectedQty = (entregaId: string, qty: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      const item = next.get(entregaId);
      if (item) next.set(entregaId, { ...item, quantidade: qty });
      return next;
    });
  };

  const updateSelectedPrice = (entregaId: string, price: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      const item = next.get(entregaId);
      if (item) next.set(entregaId, { ...item, preco_unitario: price });
      return next;
    });
  };

  // Validações
  const selectedItems = useMemo(() => Array.from(selected.values()), [selected]);
  const selectedEntregas = useMemo(
    () => entregas.filter(e => selected.has(e.entrega_id)),
    [entregas, selected],
  );

  const uniqueClientes = useMemo(() => {
    const ids = new Set(selectedEntregas.map(e => e.cliente_id));
    return ids.size;
  }, [selectedEntregas]);

  const mixedClients = uniqueClientes > 1;
  const selectedClienteId = selectedEntregas[0]?.cliente_id || null;

  const valorEstimado = useMemo(
    () => selectedItems.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0),
    [selectedItems],
  );

  // Compor NF-e
  const handleComporNfe = async () => {
    if (selectedItems.length === 0) {
      addToast('Selecione ao menos uma entrega.', 'error');
      return;
    }
    if (mixedClients) {
      addToast('Selecione entregas de um único cliente.', 'error');
      return;
    }
    if (!naturezaId) {
      addToast('Selecione a natureza de operação.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const itens: ComporNfeItem[] = selectedItems.map(item => ({
        entrega_id: item.entrega_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
      }));

      const result = await comporNfeBeneficiamento({
        clienteId: selectedClienteId!,
        naturezaOperacao: naturezaNome,
        naturezaOperacaoId: naturezaId,
        ambiente,
        itens,
      });

      addToast(
        `NF-e rascunho criada com ${result.items_count} item(ns). Revise e envie à SEFAZ.`,
        'success',
      );
      navigate(`/app/fiscal/nfe?open=${encodeURIComponent(result.emissao_id)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao gerar NF-e.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Faturamento de Beneficiamento</h1>
        <p className="text-gray-600 text-sm mt-1">
          Selecione entregas elegíveis de uma ou mais OBs do mesmo cliente e gere uma NF-e rascunho.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs text-blue-700 font-semibold">Entregas Elegíveis</p>
          <p className="text-2xl font-bold text-blue-800">{entregas.length}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs text-indigo-700 font-semibold">Selecionados</p>
          <p className="text-2xl font-bold text-indigo-800">{selectedItems.length}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold">Valor Estimado</p>
          <p className="text-2xl font-bold text-emerald-800">{formatCurrency(valorEstimado)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 flex-wrap items-end">
        <div className="w-64">
          <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
          <ClientAutocomplete
            value={clienteId}
            onChange={(id, name) => { setClienteId(id); setClienteNome(name || ''); }}
            initialName={clienteNome}
            entity="client"
            placeholder="Filtrar por cliente..."
          />
        </div>
        <div className="relative flex-grow max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar OB, produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full p-2.5 pl-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <Input label="De" name="data_inicio" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div>
          <Input label="Até" name="data_fim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
      </div>

      {/* Mixed client warning */}
      {mixedClients && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={18} />
          Você selecionou entregas de clientes diferentes. Uma NF-e só pode ter um destinatário. Ajuste a seleção.
        </div>
      )}

      {/* Tabela */}
      <GlassCard className="p-0 overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-fixed">
            <TableColGroup columns={columns} widths={widths} />
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.size === entregas.length && entregas.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <ResizableSortableTh columnId="ob" label="OB" sortable={false} onResizeStart={startResize} className="px-3 py-3" />
                <ResizableSortableTh columnId="codigo" label="Código" sortable={false} onResizeStart={startResize} className="px-3 py-3" />
                <ResizableSortableTh columnId="produto" label="Produto" sortable={false} onResizeStart={startResize} className="px-3 py-3" />
                <ResizableSortableTh columnId="cliente" label="Cliente" sortable={false} onResizeStart={startResize} className="px-3 py-3" />
                <ResizableSortableTh columnId="data" label="Data Entrega" sortable={false} onResizeStart={startResize} className="px-3 py-3" />
                <ResizableSortableTh columnId="qtdDisp" label="Qtd. Disponível" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-3" />
                <ResizableSortableTh columnId="preco" label="Preço Unit." sortable={false} onResizeStart={startResize} align="right" className="px-3 py-3" />
                <ResizableSortableTh columnId="total" label="Total" sortable={false} onResizeStart={startResize} align="right" className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                    <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Carregando...</span>
                  </td>
                </tr>
              )}
              {!loading && entregas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                    <FileText className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                    <p>Nenhuma entrega elegível encontrada.</p>
                    <p className="text-xs mt-1">Libere entregas para faturamento na tela da OB.</p>
                  </td>
                </tr>
              )}
              {!loading && entregas.map(e => {
                const sel = selected.get(e.entrega_id);
                const isSelected = !!sel;
                const qty = sel?.quantidade ?? e.quantidade_disponivel;
                const price = sel?.preco_unitario ?? e.produto_preco_venda;
                return (
                  <tr key={e.entrega_id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(e)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900">{formatOrderNumber(e.ordem_numero)}</td>
                    <td className="px-3 py-3 text-gray-600 font-mono text-xs">{e.produto_sku || '—'}</td>
                    <td className="px-3 py-3 text-gray-800">{e.produto_nome}</td>
                    <td className="px-3 py-3 text-gray-700">{e.cliente_nome}</td>
                    <td className="px-3 py-3 text-gray-700">
                      {new Date(e.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {isSelected ? (
                        <input
                          type="number"
                          min={0.0001}
                          max={e.quantidade_disponivel}
                          step="any"
                          value={qty}
                          onChange={ev => updateSelectedQty(e.entrega_id, Number(ev.target.value))}
                          className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="font-medium">{e.quantidade_disponivel}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {isSelected ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={price}
                          onChange={ev => updateSelectedPrice(e.entrega_id, Number(ev.target.value))}
                          className="w-28 text-right border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span>{formatCurrency(e.produto_preco_venda)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(qty * price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Barra de ação */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-lg rounded-t-xl px-6 py-4 flex items-end gap-4 flex-wrap z-20">
        <div className="w-72">
          <label className="block text-xs font-medium text-gray-600 mb-1">Natureza de Operação</label>
          <NaturezaOperacaoAutocomplete
            value={naturezaId}
            onChange={(id, hit) => {
              setNaturezaId(id);
              setNaturezaNome(hit?.descricao || '');
            }}
            placeholder="Buscar natureza..."
          />
        </div>
        <div className="w-40">
          <Select
            label="Ambiente"
            name="ambiente"
            value={ambiente}
            onChange={e => setAmbiente(e.target.value)}
          >
            <option value="homologacao">Homologacao</option>
            <option value="producao">Producao</option>
          </Select>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          {selectedItems.length > 0 && (
            <p className="text-xs text-gray-500 mb-1">
              {selectedItems.length} entrega(s) | {formatCurrency(valorEstimado)}
            </p>
          )}
          <button
            onClick={handleComporNfe}
            disabled={submitting || selectedItems.length === 0 || mixedClients || !naturezaId}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckSquare size={18} />
            )}
            {submitting ? 'Gerando NF-e...' : 'Gerar NF-e Rascunho'}
          </button>
        </div>
      </div>
    </div>
  );
}
