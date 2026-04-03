import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, ChevronDown, ChevronRight, CheckSquare, Loader2, Plus, RefreshCw, Repeat2, Layers } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import {
  fetchConciliacaoCartaoReceber,
  fetchConciliacaoCartaoPagar,
  type ConciliacaoGroup,
  type ConciliacaoResult,
  type ConciliacaoTitulo,
} from '@/services/conciliacaoCartao';
import { receberContasAReceberLote } from '@/services/contasAReceber';
import { pagarContasPagarLote } from '@/services/financeiro';
import BaixaEmLoteModal from '@/components/financeiro/common/BaixaEmLoteModal';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';
import SideSheet from '@/components/ui/SideSheet';
import ContasPagarFormPanel from '@/components/financeiro/contas-pagar/ContasPagarFormPanel';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import { toggleSort, sortRows, type SortState, type SortColumnDef } from '@/components/ui/table/sortUtils';

type Tipo = 'receber' | 'pagar';
type ConcSortId = 'descricao' | 'pessoa' | 'vencimento' | 'valor' | 'status';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
};

// Status label helpers per tipo
const PAID_STATUS: Record<Tipo, string> = { receber: 'recebido', pagar: 'paga' };
const PAID_LABEL: Record<Tipo, string> = { receber: 'Recebido', pagar: 'Pago' };
const PENDING_LABEL: Record<Tipo, string> = { receber: 'A receber', pagar: 'A pagar' };
const PERSON_LABEL: Record<Tipo, string> = { receber: 'Cliente', pagar: 'Fornecedor' };
const DROPDOWN_TIPO: Record<Tipo, 'recebimento' | 'pagamento'> = { receber: 'recebimento', pagar: 'pagamento' };
const STATUS_OPTIONS_PAID: Record<Tipo, { value: string; label: string }> = {
  receber: { value: 'recebido', label: 'Recebidos' },
  pagar: { value: 'pago', label: 'Pagos' },
};

function isPaid(status: string, tipo: Tipo): boolean {
  return status === PAID_STATUS[tipo];
}

export default function ConciliacaoCartaoPage() {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const lastEmpresaRef = useRef(activeEmpresaId);

  const [tipo, setTipo] = useState<Tipo>('pagar');
  const [formaPagamento, setFormaPagamento] = useState<string>('Cartão de crédito');
  const [statusFilter, setStatusFilter] = useState<string>('pendentes');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [data, setData] = useState<ConciliacaoResult<any> | null>(null);
  const [loading, setLoading] = useState(false);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  // Map<id, saldo> — persists across filter changes so user can accumulate selections
  const [selectedMap, setSelectedMap] = useState<Map<string, number>>(new Map());

  const [baixaModalOpen, setBaixaModalOpen] = useState(false);
  const [baixaModalIds, setBaixaModalIds] = useState<string[]>([]);
  const [baixaModalTotal, setBaixaModalTotal] = useState<number>(0);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const [sort, setSort] = useState<SortState<ConcSortId>>(null);
  const handleSort = useCallback((col: ConcSortId) => setSort((prev) => toggleSort(prev, col)), []);
  const sortColumns = useMemo<SortColumnDef<ConciliacaoTitulo, ConcSortId>[]>(() => [
    { id: 'descricao', type: 'string', getValue: (r) => r.descricao },
    { id: 'pessoa', type: 'string', getValue: (r) => (tipo === 'pagar' ? r.fornecedor_nome : r.cliente_nome) },
    { id: 'vencimento', type: 'date', getValue: (r) => r.data_vencimento },
    { id: 'valor', type: 'number', getValue: (r) => r.saldo ?? r.valor },
    { id: 'status', type: 'string', getValue: (r) => r.status },
  ], [tipo]);

  // Derived from selectedMap for UI
  const selectedIds = useMemo(() => new Set(selectedMap.keys()), [selectedMap]);
  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const val of selectedMap.values()) total += val;
    return total;
  }, [selectedMap]);

  // Reset on empresa change
  useEffect(() => {
    if (activeEmpresaId !== lastEmpresaRef.current) {
      lastEmpresaRef.current = activeEmpresaId;
      setData(null);
      setSelectedMap(new Map());
    }
  }, [activeEmpresaId]);

  // Reset selection on tipo change
  useEffect(() => {
    setData(null);
    setSelectedMap(new Map());
    setStatusFilter('pendentes');
  }, [tipo]);

  const loadData = useCallback(async () => {
    if (!activeEmpresaId) return;
    setLoading(true);
    try {
      const fetchFn = tipo === 'pagar' ? fetchConciliacaoCartaoPagar : fetchConciliacaoCartaoReceber;
      const result = await fetchFn({
        formaPagamento: formaPagamento || 'Cartão de crédito',
        status: statusFilter,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setData(result);
      // Auto-expand all groups
      const dates = new Set((result?.groups || []).map((g: ConciliacaoGroup) => g.data_vencimento));
      setExpandedDates(dates);
      // NOTE: selections are NOT cleared — user can accumulate across filter changes
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, tipo, formaPagamento, statusFilter, startDate, endDate, addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleExpand = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleSelect = (titulo: ConciliacaoTitulo) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(titulo.id)) {
        next.delete(titulo.id);
      } else {
        next.set(titulo.id, Number(titulo.saldo ?? titulo.valor ?? 0));
      }
      return next;
    });
  };

  const selectAllInGroup = (group: ConciliacaoGroup) => {
    const pending = group.titulos.filter((t) => !isPaid(t.status, tipo));
    setSelectedMap((prev) => {
      const next = new Map(prev);
      const allSelected = pending.every((t) => next.has(t.id));
      if (allSelected) {
        pending.forEach((t) => next.delete(t.id));
      } else {
        pending.forEach((t) => next.set(t.id, Number(t.saldo ?? t.valor ?? 0)));
      }
      return next;
    });
  };

  const openBaixaDia = (group: ConciliacaoGroup) => {
    const pendingTitulos = group.titulos.filter((t) => !isPaid(t.status, tipo));
    if (!pendingTitulos.length) {
      addToast(`Todos os títulos deste dia já foram ${tipo === 'pagar' ? 'pagos' : 'recebidos'}.`, 'info');
      return;
    }
    const ids = pendingTitulos.map((t) => t.id);
    const total = pendingTitulos.reduce((acc, t) => acc + Number(t.saldo ?? t.valor ?? 0), 0);
    setBaixaModalIds(ids);
    setBaixaModalTotal(total);
    setBaixaModalOpen(true);
  };

  const openBaixaSelecionados = () => {
    if (!selectedMap.size) return;
    const ids = Array.from(selectedMap.keys());
    const total = selectedTotal;
    if (ids.length === 0) {
      addToast('Nenhum título pendente selecionado.', 'info');
      return;
    }
    setBaixaModalIds(ids);
    setBaixaModalTotal(total);
    setBaixaModalOpen(true);
  };

  const handleBaixaConfirm = async ({ contaCorrenteId, dataISO }: { contaCorrenteId: string | null; dataISO: string }) => {
    try {
      if (tipo === 'pagar') {
        const res = await pagarContasPagarLote({
          ids: baixaModalIds,
          dataPagamento: dataISO,
          contaCorrenteId,
        });
        addToast(`${res.settled} pagamento(s) registrado(s).`, 'success');
      } else {
        const res = await receberContasAReceberLote({
          ids: baixaModalIds,
          dataPagamento: dataISO,
          contaCorrenteId,
        });
        const count = (res as any)?.settled ?? (res as any)?.total ?? baixaModalIds.length;
        addToast(`${count} recebimento(s) registrado(s).`, 'success');
      }
      setBaixaModalOpen(false);
      setBaixaModalIds([]);
      setSelectedMap(new Map());
      void loadData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao processar baixa.', 'error');
    }
  };

  const summary = data?.summary;
  const groups: ConciliacaoGroup[] = data?.groups || [];

  // Normalize summary values for both types
  const summaryPending = tipo === 'pagar' ? summary?.total_a_pagar : summary?.total_a_receber;
  const summaryOverdue = summary?.total_vencido;
  const summarySettled = tipo === 'pagar' ? summary?.total_pago : summary?.total_recebido;

  // Count how many selected items are NOT visible in current view
  const visibleIds = useMemo(() => new Set(groups.flatMap((g) => g.titulos.map((t) => t.id))), [groups]);
  const hiddenSelectedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedMap.keys()) {
      if (!visibleIds.has(id)) count++;
    }
    return count;
  }, [selectedMap, visibleIds]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <CreditCard className="text-emerald-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conciliação de Cartão</h1>
            <p className="text-sm text-gray-500">Títulos agrupados por data de vencimento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tipo === 'pagar' && (
            <Button onClick={() => setQuickCreateOpen(true)} className="gap-2">
              <Plus size={16} />
              Nova conta
            </Button>
          )}
          <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Toggle Receber / Pagar */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setTipo('pagar')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
            tipo === 'pagar'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Contas a Pagar
        </button>
        <button
          type="button"
          onClick={() => setTipo('receber')}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
            tipo === 'receber'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Contas a Receber
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end bg-white rounded-xl border border-gray-200 p-4">
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
          <MeioPagamentoDropdown
            tipo={DROPDOWN_TIPO[tipo]}
            value={formaPagamento}
            onChange={(v) => setFormaPagamento(v || 'Cartão de crédito')}
            placeholder="Selecione..."
          />
        </div>
        <Select
          className="sm:col-span-2"
          label="Status"
          name="status_filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="pendentes">Pendentes / Vencidos</option>
          <option value={STATUS_OPTIONS_PAID[tipo].value}>{STATUS_OPTIONS_PAID[tipo].label}</option>
          <option value="todos">Todos</option>
        </Select>
        <Input
          className="sm:col-span-2"
          label="De"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          className="sm:col-span-2"
          label="Até"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        {selectedMap.size > 0 && (
          <div className="sm:col-span-3 flex items-end">
            <Button onClick={openBaixaSelecionados} className="w-full gap-2">
              <CheckSquare size={16} />
              Baixar selecionados
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard label={PENDING_LABEL[tipo]} value={summaryPending ?? 0} color="blue" />
          <SummaryCard label="Vencido" value={summaryOverdue ?? 0} color="red" />
          <SummaryCard label={PAID_LABEL[tipo]} value={summarySettled ?? 0} color="green" />
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 className="animate-spin" size={20} />
          Carregando...
        </div>
      )}

      {/* Empty State */}
      {!loading && groups.length === 0 && (
        <div className="text-center py-16">
          <CreditCard className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Nenhum título encontrado</p>
          <p className="text-sm text-gray-400 mt-1">Ajuste os filtros ou verifique se há títulos com essa forma de pagamento.</p>
        </div>
      )}

      {/* Groups */}
      {groups.map((group) => (
        <DateGroup
          key={group.data_vencimento}
          group={group}
          tipo={tipo}
          expanded={expandedDates.has(group.data_vencimento)}
          selectedIds={selectedIds}
          onToggleExpand={() => toggleExpand(group.data_vencimento)}
          onToggleSelect={toggleSelect}
          onSelectAll={() => selectAllInGroup(group)}
          onBaixaDia={() => openBaixaDia(group)}
          statusFilter={statusFilter}
          sort={sort}
          onSort={handleSort}
          sortColumns={sortColumns}
        />
      ))}

      {/* Selection Totalizer Bar — sticky bottom */}
      {selectedMap.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Selecionados</p>
                <p className="text-lg font-bold text-gray-900">
                  {selectedMap.size} título{selectedMap.size !== 1 ? 's' : ''}
                  {hiddenSelectedCount > 0 && (
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      ({hiddenSelectedCount} fora do filtro atual)
                    </span>
                  )}
                </p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total selecionado</p>
                <p className="text-lg font-bold text-blue-700">{brl.format(selectedTotal)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedMap(new Map())}
                className="text-gray-600"
              >
                Limpar seleção
              </Button>
              <Button onClick={openBaixaSelecionados} className="gap-2">
                <CheckSquare size={16} />
                Baixar {selectedMap.size} selecionado(s)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Baixa Modal */}
      <BaixaEmLoteModal
        isOpen={baixaModalOpen}
        onClose={() => setBaixaModalOpen(false)}
        tipo={tipo}
        selectedCount={baixaModalIds.length}
        totalSaldo={baixaModalTotal}
        onConfirm={handleBaixaConfirm}
      />

      {/* Quick Create Conta a Pagar */}
      <SideSheet
        isOpen={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        title="Nova conta a pagar"
        description="A forma de pagamento é fixada em Cartão de Crédito."
        widthClassName="w-[min(640px,92vw)]"
      >
        <ContasPagarFormPanel
          conta={{
            forma_pagamento: formaPagamento || 'Cartão de crédito',
          }}
          onSaveSuccess={() => {
            setQuickCreateOpen(false);
            void loadData();
          }}
          onClose={() => setQuickCreateOpen(false)}
        />
      </SideSheet>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'red' | 'green' }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{brl.format(value)}</p>
    </div>
  );
}

function DateGroup({
  group,
  tipo,
  expanded,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
  onSelectAll,
  onBaixaDia,
  statusFilter,
  sort,
  onSort,
  sortColumns,
}: {
  group: ConciliacaoGroup;
  tipo: Tipo;
  expanded: boolean;
  selectedIds: Set<string>;
  onToggleExpand: () => void;
  onToggleSelect: (titulo: ConciliacaoTitulo) => void;
  onSelectAll: () => void;
  onBaixaDia: () => void;
  statusFilter: string;
  sort: SortState<ConcSortId>;
  onSort: (col: ConcSortId) => void;
  sortColumns: SortColumnDef<ConciliacaoTitulo, ConcSortId>[];
}) {
  const paidStatus = PAID_STATUS[tipo];
  const paidFilterValue = STATUS_OPTIONS_PAID[tipo].value;
  const pendingTitulos = group.titulos.filter((t) => t.status !== paidStatus);
  const allPendingSelected = pendingTitulos.length > 0 && pendingTitulos.every((t) => selectedIds.has(t.id));
  const hasPending = pendingTitulos.length > 0;
  const isOverdue = new Date(group.data_vencimento + 'T00:00:00') < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Group Header */}
      <div
        className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition ${
          isOverdue && hasPending ? 'bg-red-50/50' : ''
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
          <div>
            <span className="font-bold text-gray-800">{dateBR(group.data_vencimento)}</span>
            {isOverdue && hasPending && (
              <span className="ml-2 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Vencido</span>
            )}
          </div>
          <span className="text-sm text-gray-500">
            — {brl.format(group.total_valor)} ({group.total_titulos} título{group.total_titulos !== 1 ? 's' : ''})
          </span>
        </div>
        {hasPending && statusFilter !== paidFilterValue && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={(e) => {
              e.stopPropagation();
              onBaixaDia();
            }}
          >
            <CheckSquare size={14} />
            Baixar dia
          </Button>
        )}
      </div>

      {/* Group Body */}
      {expanded && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80">
              <tr>
                {hasPending && statusFilter !== paidFilterValue && (
                  <th className="w-10 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={onSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                <ResizableSortableTh<ConcSortId> columnId="descricao" label="Descrição" sort={sort} onSort={onSort} resizable={false} className="px-4 py-2 text-xs font-medium text-gray-500 uppercase" />
                <ResizableSortableTh<ConcSortId> columnId="pessoa" label={PERSON_LABEL[tipo]} sort={sort} onSort={onSort} resizable={false} className="px-4 py-2 text-xs font-medium text-gray-500 uppercase" />
                <ResizableSortableTh<ConcSortId> columnId="vencimento" label="Vencimento" sort={sort} onSort={onSort} resizable={false} className="px-4 py-2 text-xs font-medium text-gray-500 uppercase" />
                <ResizableSortableTh<ConcSortId> columnId="valor" label="Valor" align="right" sort={sort} onSort={onSort} resizable={false} className="px-4 py-2 text-xs font-medium text-gray-500 uppercase" />
                <ResizableSortableTh<ConcSortId> columnId="status" label="Status" align="center" sort={sort} onSort={onSort} resizable={false} className="px-4 py-2 text-xs font-medium text-gray-500 uppercase" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortRows(group.titulos, sort, sortColumns).map((t) => (
                <TituloRow
                  key={t.id}
                  titulo={t}
                  tipo={tipo}
                  selected={selectedIds.has(t.id)}
                  onToggle={() => onToggleSelect(t)}
                  showCheckbox={hasPending && statusFilter !== paidFilterValue}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TituloRow({
  titulo,
  tipo,
  selected,
  onToggle,
  showCheckbox,
}: {
  titulo: ConciliacaoTitulo;
  tipo: Tipo;
  selected: boolean;
  onToggle: () => void;
  showCheckbox: boolean;
}) {
  const paid = isPaid(titulo.status, tipo);
  const isOverdue =
    !paid && new Date(titulo.data_vencimento + 'T00:00:00') < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

  const personName = tipo === 'pagar' ? titulo.fornecedor_nome : titulo.cliente_nome;

  const handleRowClick = () => {
    if (!paid && showCheckbox) onToggle();
  };

  return (
    <tr
      className={`transition ${paid ? 'opacity-60' : ''} ${!paid && showCheckbox ? 'cursor-pointer' : ''} ${selected && !paid ? 'bg-blue-100 hover:bg-blue-200/70 border-l-2 border-l-blue-500' : 'hover:bg-gray-50/50 border-l-2 border-l-transparent'}`}
      onClick={handleRowClick}
    >
      {showCheckbox && (
        <td className="w-10 px-3 py-2 text-center">
          {!paid && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          )}
        </td>
      )}
      <td className="px-4 py-2 text-gray-800 font-medium truncate max-w-[250px]">
        <span className="inline-flex items-center gap-1.5">
          {titulo.descricao}
          {titulo.origem_tipo === 'RECORRENCIA' && (
            <span title="Conta recorrente" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">
              <Repeat2 size={11} />
              Recorrente
            </span>
          )}
          {titulo.origem_tipo === 'PARCELAMENTO_PARCELA' && (
            <span title="Conta parcelada" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">
              <Layers size={11} />
              Parcelada
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-600 truncate max-w-[180px]">{personName || '—'}</td>
      <td className="px-4 py-2 text-gray-600">{dateBR(titulo.data_vencimento)}</td>
      <td className="px-4 py-2 text-right font-semibold text-gray-900">{brl.format(titulo.saldo ?? titulo.valor)}</td>
      <td className="px-4 py-2 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            paid
              ? 'bg-emerald-100 text-emerald-700'
              : isOverdue
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {paid ? PAID_LABEL[tipo] : isOverdue ? 'Vencido' : 'Pendente'}
        </span>
      </td>
    </tr>
  );
}
