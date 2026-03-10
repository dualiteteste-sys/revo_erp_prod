import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, ChevronDown, ChevronRight, CheckSquare, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { fetchConciliacaoCartao, type ConciliacaoGroup, type ConciliacaoResult, type ConciliacaoTitulo } from '@/services/conciliacaoCartao';
import { receberContasAReceberLote } from '@/services/contasAReceber';
import BaixaEmLoteModal from '@/components/financeiro/common/BaixaEmLoteModal';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/button';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
};

export default function ConciliacaoCartaoPage() {
  const { activeEmpresaId } = useAuth();
  const { addToast } = useToast();
  const lastEmpresaRef = useRef(activeEmpresaId);

  const [formaPagamento, setFormaPagamento] = useState<string>('Cartão de crédito');
  const [statusFilter, setStatusFilter] = useState<string>('pendentes');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [data, setData] = useState<ConciliacaoResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [baixaModalOpen, setBaixaModalOpen] = useState(false);
  const [baixaModalIds, setBaixaModalIds] = useState<string[]>([]);
  const [baixaModalTotal, setBaixaModalTotal] = useState<number>(0);

  // Reset on empresa change
  useEffect(() => {
    if (activeEmpresaId !== lastEmpresaRef.current) {
      lastEmpresaRef.current = activeEmpresaId;
      setData(null);
      setSelectedIds(new Set());
    }
  }, [activeEmpresaId]);

  const loadData = useCallback(async () => {
    if (!activeEmpresaId) return;
    setLoading(true);
    try {
      const result = await fetchConciliacaoCartao({
        formaPagamento: formaPagamento || 'Cartão de crédito',
        status: statusFilter,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setData(result);
      // Auto-expand all groups
      const dates = new Set((result?.groups || []).map((g) => g.data_vencimento));
      setExpandedDates(dates);
      setSelectedIds(new Set());
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, formaPagamento, statusFilter, startDate, endDate, addToast]);

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInGroup = (group: ConciliacaoGroup) => {
    const pendingIds = group.titulos.filter((t) => t.status !== 'recebido').map((t) => t.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pendingIds.every((id) => next.has(id));
      if (allSelected) {
        pendingIds.forEach((id) => next.delete(id));
      } else {
        pendingIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const openBaixaDia = (group: ConciliacaoGroup) => {
    const pendingTitulos = group.titulos.filter((t) => t.status !== 'recebido');
    if (!pendingTitulos.length) {
      addToast('Todos os títulos deste dia já foram recebidos.', 'info');
      return;
    }
    const ids = pendingTitulos.map((t) => t.id);
    const total = pendingTitulos.reduce((acc, t) => acc + Number(t.valor || 0), 0);
    setBaixaModalIds(ids);
    setBaixaModalTotal(total);
    setBaixaModalOpen(true);
  };

  const openBaixaSelecionados = () => {
    if (!selectedIds.size) return;
    const allTitulos = (data?.groups || []).flatMap((g) => g.titulos);
    const selected = allTitulos.filter((t) => selectedIds.has(t.id) && t.status !== 'recebido');
    if (!selected.length) {
      addToast('Nenhum título pendente selecionado.', 'info');
      return;
    }
    const ids = selected.map((t) => t.id);
    const total = selected.reduce((acc, t) => acc + Number(t.valor || 0), 0);
    setBaixaModalIds(ids);
    setBaixaModalTotal(total);
    setBaixaModalOpen(true);
  };

  const handleBaixaConfirm = async ({ contaCorrenteId, dataISO }: { contaCorrenteId: string | null; dataISO: string }) => {
    try {
      const res = await receberContasAReceberLote({
        ids: baixaModalIds,
        dataPagamento: dataISO,
        contaCorrenteId,
      });
      const count = (res as any)?.total ?? baixaModalIds.length;
      addToast(`${count} recebimento(s) registrado(s).`, 'success');
      setBaixaModalOpen(false);
      setBaixaModalIds([]);
      setSelectedIds(new Set());
      void loadData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao processar baixa.', 'error');
    }
  };

  const selectedTotal = useMemo(() => {
    if (!selectedIds.size || !data) return 0;
    const allTitulos = data.groups.flatMap((g) => g.titulos);
    return allTitulos
      .filter((t) => selectedIds.has(t.id) && t.status !== 'recebido')
      .reduce((acc, t) => acc + Number(t.valor || 0), 0);
  }, [selectedIds, data]);

  const summary = data?.summary;
  const groups = data?.groups || [];

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
            <p className="text-sm text-gray-500">Recebíveis agrupados por data de vencimento</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end bg-white rounded-xl border border-gray-200 p-4">
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
          <MeioPagamentoDropdown
            tipo="recebimento"
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
          <option value="recebido">Recebidos</option>
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
        {selectedIds.size > 0 && (
          <div className="sm:col-span-3">
            <Button onClick={openBaixaSelecionados} className="w-full gap-2">
              <CheckSquare size={16} />
              Baixar {selectedIds.size} selecionado(s)
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard label="A receber" value={summary.total_a_receber} color="blue" />
          <SummaryCard label="Vencido" value={summary.total_vencido} color="red" />
          <SummaryCard label="Recebido" value={summary.total_recebido} color="green" />
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
          expanded={expandedDates.has(group.data_vencimento)}
          selectedIds={selectedIds}
          onToggleExpand={() => toggleExpand(group.data_vencimento)}
          onToggleSelect={toggleSelect}
          onSelectAll={() => selectAllInGroup(group)}
          onBaixaDia={() => openBaixaDia(group)}
          statusFilter={statusFilter}
        />
      ))}

      {/* Baixa Modal */}
      <BaixaEmLoteModal
        isOpen={baixaModalOpen}
        onClose={() => setBaixaModalOpen(false)}
        tipo="receber"
        selectedCount={baixaModalIds.length}
        totalSaldo={baixaModalTotal}
        onConfirm={handleBaixaConfirm}
      />
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
  expanded,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
  onSelectAll,
  onBaixaDia,
  statusFilter,
}: {
  group: ConciliacaoGroup;
  expanded: boolean;
  selectedIds: Set<string>;
  onToggleExpand: () => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onBaixaDia: () => void;
  statusFilter: string;
}) {
  const pendingTitulos = group.titulos.filter((t) => t.status !== 'recebido');
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
        {hasPending && statusFilter !== 'recebido' && (
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
                {hasPending && statusFilter !== 'recebido' && (
                  <th className="w-10 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={onSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vencimento</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {group.titulos.map((t) => (
                <TituloRow
                  key={t.id}
                  titulo={t}
                  selected={selectedIds.has(t.id)}
                  onToggle={() => onToggleSelect(t.id)}
                  showCheckbox={hasPending && statusFilter !== 'recebido'}
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
  selected,
  onToggle,
  showCheckbox,
}: {
  titulo: ConciliacaoTitulo;
  selected: boolean;
  onToggle: () => void;
  showCheckbox: boolean;
}) {
  const isRecebido = titulo.status === 'recebido';
  const isOverdue =
    !isRecebido && new Date(titulo.data_vencimento + 'T00:00:00') < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

  return (
    <tr className={`hover:bg-gray-50/50 transition ${isRecebido ? 'opacity-60' : ''}`}>
      {showCheckbox && (
        <td className="w-10 px-3 py-2 text-center">
          {!isRecebido && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          )}
        </td>
      )}
      <td className="px-4 py-2 text-gray-800 font-medium truncate max-w-[250px]">{titulo.descricao}</td>
      <td className="px-4 py-2 text-gray-600 truncate max-w-[180px]">{titulo.cliente_nome || '—'}</td>
      <td className="px-4 py-2 text-gray-600">{dateBR(titulo.data_vencimento)}</td>
      <td className="px-4 py-2 text-right font-semibold text-gray-900">{brl.format(titulo.valor)}</td>
      <td className="px-4 py-2 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            isRecebido
              ? 'bg-emerald-100 text-emerald-700'
              : isOverdue
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {isRecebido ? 'Recebido' : isOverdue ? 'Vencido' : 'Pendente'}
        </span>
      </td>
    </tr>
  );
}
